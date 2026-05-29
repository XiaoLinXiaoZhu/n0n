/**
 * @n0n/code 多行输入 — 基于 @xlxz/terminal-renderer 的实现
 *
 * 替换 @n0n/multiline-input。用虚拟 Grid + Viewport + TextInput 重建多行输入，
 * 利用 cell 级 dirty diff 与动态区域管理，零撕裂、自动处理终端高度边界。
 *
 * 接口与 @n0n/multiline-input 保持一致：readMultilineInput({prompt, hint, connectStdin})
 * → Promise<{text, lineCount} | null>，使 repl 调用点零改动。
 *
 * 阶段一：对等替换（编辑/粘贴/提交/中断/宽字符/动态高度）。
 * 状态栏、上下滚动指示器、@mention 菜单见后续阶段。
 */

import {
	encodeStyle,
	Grid,
	parseKey,
	TextInput,
	Viewport,
} from "@xlxz/terminal-renderer";
import type { UserInputConfig } from "./config.ts";
import {
	calcDescBox,
	calcMenuPosition,
	calcMenuScrollTop,
	computeMentionDecorations,
	detectMention,
	filterMentions,
	loadMentionItems,
	type MentionItem,
	maxLabelWidth,
	mentionLabel,
	paintDescBox,
	paintMenu,
	setupMenuOwnership,
} from "./mention.ts";
import {
	type ColSpan,
	calcColSpan,
	calcScrollOverflow,
	countVisualLines,
	getLayout,
	INDICATOR_ROWS,
	paintAboveIndicator,
	paintBelowIndicator,
	paintSideFrame,
	paintStatusBar,
	STATUS_ROWS,
} from "./ui.ts";

// ── bracketed paste 控制序列 ──
const BP_ON = "\x1b[?2004h";
const BP_OFF = "\x1b[?2004l";
const TAB_SPACES = "  ";

// ── 动态高度配置 ──
/** 输入区最小行数 */
const MIN_INPUT_ROWS = 1;
/** 输入区最大行数（运行时再用终端高度和配置 clamp） */
const MAX_INPUT_ROWS = 20;
/** 终端底部保留行数（避免动态区贴到终端最底、给 commit 留余量） */
const TERM_RESERVE = 2;

const OWNER_INPUT = "input";
const OWNER_MENU = "menu";
const OWNER_DESC = "desc";

const descTextStyle = encodeStyle(-1, -1, 0);
/** 菜单候选框默认最大宽度 */
const MENU_MAX_WIDTH = 40;
/** 菜单打开时期望预留的最大行数（含上下边框），实际受终端高度 clamp */
const MENU_MAX_RESERVE = 10;
const menuHighlightStyle = encodeStyle(0, 6, 0);
const menuNormalStyle = encodeStyle(-1, -1, 0);

export interface MultilineInputOptions {
	prompt?: string;
	hint?: string;
	/** 编辑器配置（最大宽高、对齐）。未提供时用内部默认（全部无限制、左对齐）。 */
	editor?: UserInputConfig;
	output?: NodeJS.WriteStream;
	/**
	 * 外部 stdin 数据源注入点。提供时本函数不自管 stdin（不设 raw mode、
	 * 不加 listener），通过 handler 接收数据，返回清理函数。
	 *
	 * 注意：repl 的 StdinController 使用 setEncoding("utf8")，handler 收到 string。
	 */
	connectStdin?: (handler: (data: string) => void) => () => void;
}

export interface MultilineInputResult {
	text: string;
	lineCount: number;
}

/** 根据文本和终端尺寸计算输入区所需的 grid 行数（含状态栏和指标行预留） */
function calcGridRows(
	text: string,
	termCols: number,
	termRows: number,
	maxInputRows: number,
	menuReserveRows = 0,
): number {
	const maxRows = Math.max(
		MIN_INPUT_ROWS,
		Math.min(maxInputRows, termRows - TERM_RESERVE),
	);
	const needed =
		countVisualLines(text, termCols) + STATUS_ROWS + INDICATOR_ROWS;
	const base = Math.max(
		MIN_INPUT_ROWS + STATUS_ROWS,
		Math.min(needed, maxRows),
	);
	if (menuReserveRows <= 0) return base;
	// 菜单打开时，保证 grid 高度能容纳「输入文本 + 菜单 + 状态栏」，
	// 但整体仍受终端可见高度硬约束（动态区高度 ≤ termRows - TERM_RESERVE）。
	const withMenu = needed + menuReserveRows;
	const hardCap = Math.max(
		MIN_INPUT_ROWS + STATUS_ROWS,
		termRows - TERM_RESERVE,
	);
	return Math.max(base, Math.min(withMenu, hardCap));
}

export function readMultilineInput(
	options?: MultilineInputOptions,
): Promise<MultilineInputResult | null> {
	const out = options?.output ?? process.stderr;

	return new Promise<MultilineInputResult | null>((resolve) => {
		const getCols = (): number => out.columns || 80;
		const getRows = (): number => out.rows || 24;

		const editorConfig = options?.editor ?? {
			maxWidth: null,
			maxHeight: null,
			align: "left",
		};

		const ti = new TextInput();
		let allMentions: MentionItem[] = [];
		let menuOpen = false;
		let menuItems: MentionItem[] = [];
		let menuSelected = 0;
		let menuQuery = "";
		// 异步加载 skill 候选（失败则补全不可用，不影响输入）
		loadMentionItems()
			.then((items) => {
				allMentions = items;
			})
			.catch(() => {});

		const maxInputRows = editorConfig.maxHeight ?? MAX_INPUT_ROWS;
		let gridRows = calcGridRows("", getCols(), getRows(), maxInputRows);
		let colSpan: ColSpan = calcColSpan(
			getCols(),
			editorConfig.maxWidth,
			editorConfig.align,
		);
		const grid = Grid.create(getCols(), gridRows);
		const vp = new Viewport(grid, out);

		// bracketed paste 跨 chunk 聚合状态
		let isPasting = false;
		let pasteBuffer = "";

		const w = (s: string) => out.write(s);

		// prompt/hint 作为静态前导行写入历史（不进动态区）
		if (options?.prompt) {
			const hint = options?.hint ?? "";
			w(`${options.prompt}${hint ? ` ${hint}` : ""}\n`);
		}

		w(BP_ON);
		// 隐藏光标，渲染期间避免闪动
		w("\x1b[?25l");
		vp.mount();
		render();
		w("\x1b[?25h");

		let disconnectStdin: (() => void) | null = null;

		function setupOwnership(hasAbove: boolean, hasBelow: boolean): void {
			const layout = getLayout(grid.rows, hasAbove, hasBelow);
			for (let r = 0; r < grid.rows; r++) {
				for (let c = 0; c < grid.cols; c++) {
					grid.setOwner(r, c, "");
				}
			}
			for (let r = layout.inputStartRow; r <= layout.inputEndRow; r++) {
				for (let c = colSpan.startCol; c < colSpan.endCol; c++) {
					grid.setOwner(r, c, OWNER_INPUT);
				}
			}
		}

		function resizeGridIfNeeded(): void {
			const menuReserve =
				menuOpen && menuItems.length > 0
					? Math.min(menuItems.length + 2, MENU_MAX_RESERVE)
					: 0;
			const newRows = calcGridRows(
				ti.text,
				getCols(),
				getRows(),
				maxInputRows,
				menuReserve,
			);
			if (newRows === gridRows) return;
			gridRows = newRows;
			vp.remount(getCols(), gridRows);
		}

		function refreshMention(): void {
			const ctx = detectMention(ti.text, ti.cursorOffset);
			if (ctx && allMentions.length > 0) {
				menuQuery = ctx.query;
				menuItems = filterMentions(allMentions, menuQuery);
				if (menuItems.length > 0) {
					menuOpen = true;
					if (menuSelected >= menuItems.length) menuSelected = 0;
					return;
				}
			}
			menuOpen = false;
			menuItems = [];
			menuSelected = 0;
		}

		function acceptMention(): void {
			const item = menuItems[menuSelected];
			if (!item) return;
			const ctx = detectMention(ti.text, ti.cursorOffset);
			if (!ctx) return;
			// 当前逻辑行从 lineStart 到光标处替换为 @name
			const head = ti.text.slice(0, ctx.lineStart);
			const tail = ti.text.slice(ti.cursorOffset);
			const inserted = `@${item.name}`;
			ti.text = head + inserted + tail;
			ti.cursorOffset = head.length + inserted.length;
			ti.stickyCol = null;
			menuOpen = false;
			menuItems = [];
			menuSelected = 0;
		}

		function render(): void {
			vp.beginSync();
			resizeGridIfNeeded();
			colSpan = calcColSpan(
				grid.cols,
				editorConfig.maxWidth,
				editorConfig.align,
			);
			// 每次重算 @token 高亮区间——decorations 是静态绝对 offset，不随编辑平移
			ti.decorations = computeMentionDecorations(ti.text);

			// 第一遍：无指示行布局，确定 scrollOffset 与可见行数，算溢出
			setupOwnership(false, false);
			ti.ensureCursorVisible(grid, OWNER_INPUT);
			ti.paint(grid, OWNER_INPUT);
			const layout0 = getLayout(grid.rows, false, false);
			const visibleRows0 = layout0.inputEndRow - layout0.inputStartRow + 1;
			let overflow = calcScrollOverflow(
				ti.text,
				ti.scrollOffset,
				grid.cols,
				visibleRows0,
			);
			const hasAbove = overflow.above > 0;
			const hasBelow = overflow.below > 0;
			const hasIndicator = hasAbove || hasBelow;

			// 第二遍：若需指示行，输入区让出对应行数，重排并重算溢出
			if (hasIndicator) {
				setupOwnership(hasAbove, hasBelow);
				ti.ensureCursorVisible(grid, OWNER_INPUT);
				ti.paint(grid, OWNER_INPUT);
				const layout1 = getLayout(grid.rows, hasAbove, hasBelow);
				const visibleRows1 = layout1.inputEndRow - layout1.inputStartRow + 1;
				overflow = calcScrollOverflow(
					ti.text,
					ti.scrollOffset,
					grid.cols,
					visibleRows1,
				);
			}

			if (menuOpen && menuItems.length > 0) {
				const labels = menuItems.map(mentionLabel);
				const menuMaxWidth = Math.min(MENU_MAX_WIDTH, colSpan.width);
				const box = calcMenuPosition(
					grid.rows,
					grid.cols,
					ti.cursorRow,
					ti.cursorCol,
					menuItems.length,
					maxLabelWidth(labels, menuMaxWidth),
				);
				if (box) {
					// 菜单高度不能超过输入区可见高度（含边框），需求 3
					const curLayout = hasIndicator
						? getLayout(grid.rows, hasAbove, hasBelow)
						: layout0;
					const inputVisibleRows =
						curLayout.inputEndRow - curLayout.inputStartRow + 1;
					if (box.boxHeight > inputVisibleRows) {
						box.boxHeight = inputVisibleRows;
						box.visibleItems = Math.max(1, inputVisibleRows - 2);
					}
					setupMenuOwnership(grid, box, OWNER_MENU);
					const descBox = calcDescBox(box, grid.cols);
					if (descBox) {
						setupMenuOwnership(grid, descBox, OWNER_DESC);
					}
					ti.paint(grid, OWNER_INPUT);
					const scrollTop = calcMenuScrollTop(
						menuSelected,
						box.visibleItems,
						menuItems.length,
					);
					paintMenu(
						grid,
						labels,
						menuSelected,
						box,
						menuHighlightStyle,
						menuNormalStyle,
						scrollTop,
					);
					if (descBox) {
						const desc = menuItems[menuSelected]?.description ?? "";
						paintDescBox(grid, desc, descBox, descTextStyle);
					}
				}
			}

			// 绘制上下指示行（各自独立出现/隐藏）
			const finalLayout = getLayout(grid.rows, hasAbove, hasBelow);
			if (hasAbove) {
				paintAboveIndicator(
					grid,
					finalLayout.aboveIndicatorRow,
					overflow.above,
					colSpan.startCol,
				);
			}
			if (hasBelow) {
				paintBelowIndicator(
					grid,
					finalLayout.belowIndicatorRow,
					overflow.below,
					colSpan.startCol,
				);
			}

			paintStatusBar(grid, ti, finalLayout.statusRow, colSpan.startCol);
			paintSideFrame(grid, colSpan);
			vp.render({ row: ti.cursorRow, col: ti.cursorCol });
			vp.endSync();
		}

		function cleanup(): void {
			w(BP_OFF);
			disconnectStdin?.();
			disconnectStdin = null;
		}

		function finish(result: MultilineInputResult | null): void {
			// 把光标移到动态区底部之后，固化输入为历史并换行
			vp.clear();
			if (result) {
				// 重新输出输入内容作为历史固定行
				vp.commit(`${ti.text}\n`);
			} else {
				vp.commit("");
			}
			w("\x1b[?25h");
			cleanup();
			resolve(result);
		}

		function submit(): void {
			finish({ text: ti.text, lineCount: ti.text.split("\n").length });
		}

		function abort(): void {
			finish(null);
		}

		function flushPaste(): void {
			if (pasteBuffer.length > 0) {
				ti.insertChar(pasteBuffer);
				pasteBuffer = "";
			}
			isPasting = false;
			render();
		}

		function onData(data: string): void {
			const buf = Buffer.from(data, "utf8");
			const key = parseKey(buf);

			// ── bracketed paste 聚合（跨 chunk）──
			if (key.type === "pasteStart") {
				isPasting = true;
				pasteBuffer = "";
				return;
			}
			if (isPasting) {
				if (key.type === "pasteEnd") {
					flushPaste();
					return;
				}
				// 粘贴期间所有数据原样累积（包括 char / enter / 多字节）
				pasteBuffer += data;
				return;
			}

			if (menuOpen) {
				switch (key.type) {
					case "up":
						menuSelected =
							(menuSelected - 1 + menuItems.length) % menuItems.length;
						render();
						return;
					case "down":
						menuSelected = (menuSelected + 1) % menuItems.length;
						render();
						return;
					case "enter":
						if (key.alt) {
							submit();
							return;
						}
						acceptMention();
						render();
						return;
					case "tab":
						acceptMention();
						render();
						return;
					case "escape":
						menuOpen = false;
						menuItems = [];
						menuSelected = 0;
						render();
						return;
					case "ctrl":
						if (key.key === "q") {
							abort();
							return;
						}
						if (key.key === "d") {
							submit();
							return;
						}
						return;
					default:
						break;
				}
			}

			switch (key.type) {
				case "ctrl":
					if (key.key === "q") {
						abort();
						return;
					}
					if (key.key === "d") {
						submit();
						return;
					}
					// 其他 ctrl 一律忽略——尤其 Ctrl+C（\x03）在 raw mode 下作为数据到达，
					// 这里吞掉以阻止其终止进程（退出走 exit 命令 / Ctrl+Q）。
					return;
				case "enter":
					if (key.alt) {
						submit();
						return;
					}
					ti.insertChar("\n");
					break;
				case "char":
					ti.insertChar(key.char);
					break;
				case "backspace":
					ti.deleteBeforeCursor();
					break;
				case "tab":
					ti.insertChar(TAB_SPACES);
					break;
				case "left":
					ti.moveLeft();
					break;
				case "right":
					ti.moveRight();
					break;
				case "up":
					ti.paint(grid, OWNER_INPUT);
					ti.moveUp(grid, OWNER_INPUT);
					break;
				case "down":
					ti.paint(grid, OWNER_INPUT);
					ti.moveDown(grid, OWNER_INPUT);
					break;
				case "home": {
					const before = ti.text.slice(0, ti.cursorOffset);
					const lastNL = before.lastIndexOf("\n");
					ti.cursorOffset = lastNL >= 0 ? lastNL + 1 : 0;
					ti.stickyCol = null;
					break;
				}
				case "end": {
					const after = ti.text.slice(ti.cursorOffset);
					const nextNL = after.indexOf("\n");
					ti.cursorOffset += nextNL >= 0 ? nextNL : after.length;
					ti.stickyCol = null;
					break;
				}
				case "delete":
					if (ti.cursorOffset < ti.text.length) {
						const head = ti.text.slice(0, ti.cursorOffset);
						const rest = ti.text.slice(ti.cursorOffset);
						const first = [...rest][0] ?? "";

						ti.text = head + rest.slice(first.length);
					}
					break;
				case "escape":
				case "pasteEnd":
				case "unknown":
					return;
				default:
					return;
			}

			refreshMention();
			render();
		}

		// ── 接管 stdin ──
		if (options?.connectStdin) {
			disconnectStdin = options.connectStdin(onData);
		} else {
			const stdin = process.stdin;
			const wasRaw = stdin.isRaw;
			stdin.setRawMode(true);
			stdin.resume();
			stdin.setEncoding("utf8");
			stdin.on("data", onData);
			disconnectStdin = () => {
				stdin.removeListener("data", onData);
				stdin.setRawMode(wasRaw ?? false);
			};
		}

		// resize 处理
		const onResize = () => render();
		out.on("resize", onResize);
		const prevDisconnect = disconnectStdin;
		disconnectStdin = () => {
			out.removeListener("resize", onResize);
			prevDisconnect?.();
		};
	});
}
