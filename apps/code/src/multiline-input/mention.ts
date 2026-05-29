/**
 * multiline-input @mention — skill 补全菜单
 *
 * 数据源：@n0n/skill 的 listSkills()（auto + manual 类别）。
 * 触发：光标所在逻辑行以 @ 开头（行首）。
 * 绘制：带边框的候选菜单，锚定在光标下方。
 *
 * 第三步将在此基础上增加 desc 描述框双框联动。
 */

import {
	BOLD,
	charWidth,
	encodeStyle,
	type Grid,
	stringWidth,
} from "@xlxz/terminal-renderer";

// ── 数据 ──

export interface MentionItem {
	name: string;
	alias: string[];
	description: string;
}

/** 加载可补全的 skill（auto + manual，排除 init） */
export async function loadMentionItems(): Promise<MentionItem[]> {
	const { listSkills } = await import("@n0n/skill");
	const skills = await listSkills();
	return skills
		.filter((s) => s.activation === "auto" || s.activation === "manual")
		.map((s) => ({
			name: s.name,
			alias: s.alias,
			description: s.description,
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

// ── 行首 @ 检测 ──

export interface MentionContext {
	/** @ 后已输入的 query（不含 @） */
	query: string;
	/** 当前逻辑行起始的 code unit offset */
	lineStart: number;
}

/**
 * 检测光标所在逻辑行是否以 @ 开头（行首触发）。
 * 返回 null 表示不触发补全。
 */
export function detectMention(
	text: string,
	cursorOffset: number,
): MentionContext | null {
	const before = text.slice(0, cursorOffset);
	const lastNL = before.lastIndexOf("\n");
	const lineStart = lastNL + 1;
	const line = before.slice(lineStart);
	if (!line.startsWith("@")) return null;
	// @ 后出现空格则视为补全结束
	const query = line.slice(1);
	if (query.includes(" ")) return null;
	return { query, lineStart };
}

// ── @token 高亮 decorations ──

/** @token 高亮样式：青色加粗 */
const mentionStyle = encodeStyle(6, -1, BOLD);

/**
 * 扫描全文，为每个行首 @token 生成高亮区间。
 *
 * decorations 用绝对 code unit offset，TextInput 不会随编辑自动平移；
 * 因此每次 render 前都重算（成本仅为遍历各逻辑行），天然免疫编辑错位。
 *
 * 一个行首 @token 的范围是 [lineStart, lineStart + tokenLen)，
 * token 到行尾或首个空格为止（与 detectMention 的触发条件一致）。
 */
export function computeMentionDecorations(
	text: string,
): { start: number; end: number; style: number }[] {
	const decos: { start: number; end: number; style: number }[] = [];
	let lineStart = 0;
	for (const line of text.split("\n")) {
		if (line.startsWith("@")) {
			const spaceIdx = line.indexOf(" ");
			const tokenLen = spaceIdx >= 0 ? spaceIdx : line.length;
			if (tokenLen >= 1) {
				decos.push({
					start: lineStart,
					end: lineStart + tokenLen,
					style: mentionStyle,
				});
			}
		}
		lineStart += line.length + 1; // +1 为被 split 掉的 \n
	}
	return decos;
}

/** 按 query 过滤候选（query 空返回全部）；匹配 name 或 alias 子串（不区分大小写） */
export function filterMentions(
	items: MentionItem[],
	query: string,
): MentionItem[] {
	if (query.length === 0) return items;
	const q = query.toLowerCase();
	return items.filter(
		(it) =>
			it.name.toLowerCase().includes(q) ||
			it.alias.some((a) => a.toLowerCase().includes(q)),
	);
}

// ── 菜单显示文本 ──

/** 候选项显示文本：name [alias1, alias2] */
export function mentionLabel(it: MentionItem): string {
	if (it.alias.length === 0) return it.name;
	return `${it.name} [${it.alias.join(", ")}]`;
}

// ── 菜单定位 ──

export interface MenuBox {
	anchorRow: number;
	anchorCol: number;
	boxWidth: number;
	boxHeight: number;
	visibleItems: number;
}

/**
 * 计算菜单渲染位置。优先光标下方，空间不够则上方，再不够则选空间更大一侧。
 * 返回 null 表示无法渲染。
 */
export function calcMenuPosition(
	gridRows: number,
	gridCols: number,
	cursorRow: number,
	cursorCol: number,
	itemCount: number,
	itemWidth: number,
): MenuBox | null {
	if (itemCount === 0) return null;
	const boxWidth = Math.min(itemWidth + 2, gridCols);
	const boxHeight = itemCount + 2; // 上下边框
	const anchorCol = Math.min(Math.max(0, cursorCol), gridCols - boxWidth);

	// 下方可用行数排除最后一行状态栏（gridRows-1），否则菜单底边框会落到状态栏行被裁切
	const belowRows = gridRows - cursorRow - 2;
	const aboveRows = cursorRow;

	if (belowRows >= boxHeight) {
		return {
			anchorRow: cursorRow + 1,
			anchorCol,
			boxWidth,
			boxHeight,
			visibleItems: itemCount,
		};
	}
	if (aboveRows >= boxHeight) {
		return {
			anchorRow: cursorRow - boxHeight,
			anchorCol,
			boxWidth,
			boxHeight,
			visibleItems: itemCount,
		};
	}
	if (belowRows >= aboveRows && belowRows >= 3) {
		return {
			anchorRow: cursorRow + 1,
			anchorCol,
			boxWidth,
			boxHeight: belowRows,
			visibleItems: Math.max(1, belowRows - 2),
		};
	}
	if (aboveRows >= 3) {
		return {
			anchorRow: cursorRow - aboveRows,
			anchorCol,
			boxWidth,
			boxHeight: aboveRows,
			visibleItems: Math.max(1, aboveRows - 2),
		};
	}
	return null;
}

/**
 * 计算菜单滚动窗口起点，使 selectedIndex 始终落在 [scrollTop, scrollTop+visibleItems) 内。
 * 选中项靠近窗口边缘时滚动窗口。
 */
export function calcMenuScrollTop(
	selectedIndex: number,
	visibleItems: number,
	itemCount: number,
): number {
	if (itemCount <= visibleItems) return 0;
	const maxTop = itemCount - visibleItems;
	// 选中项尽量居中，再 clamp 到合法范围
	let top = selectedIndex - Math.floor(visibleItems / 2);
	if (top < 0) top = 0;
	if (top > maxTop) top = maxTop;
	return top;
}

/** 为菜单区域设置 ownership（覆盖输入区） */
export function setupMenuOwnership(
	grid: Grid,
	box: {
		anchorRow: number;
		anchorCol: number;
		boxWidth: number;
		boxHeight: number;
	},
	ownerId: string,
): void {
	for (
		let r = box.anchorRow;
		r < box.anchorRow + box.boxHeight && r < grid.rows;
		r++
	) {
		for (
			let c = box.anchorCol;
			c < box.anchorCol + box.boxWidth && c < grid.cols;
			c++
		) {
			if (r >= 0) grid.setOwner(r, c, ownerId);
		}
	}
}

// ── 菜单绘制（带边框）──

const BORDER_STYLE = 0;

/**
 * 绘制带外边框的菜单。selectedIndex 项高亮。
 * @param scrollTop 第一个可见项索引（候选多于 visibleItems 时滚动）
 */
export function paintMenu(
	grid: Grid,
	labels: string[],
	selectedIndex: number,
	box: MenuBox,
	highlightStyle: number,
	normalStyle: number,
	scrollTop: number,
): void {
	const { anchorRow, anchorCol, boxWidth, boxHeight, visibleItems } = box;
	const topRow = anchorRow;
	const botRow = anchorRow + boxHeight - 1;
	const rightCol = Math.min(anchorCol + boxWidth - 1, grid.cols - 1);

	if (topRow >= 0 && topRow < grid.rows) {
		grid.setChar(topRow, anchorCol, "┌", BORDER_STYLE);
		grid.setChar(topRow, rightCol, "┐", BORDER_STYLE);
		for (let c = anchorCol + 1; c < rightCol; c++)
			grid.setChar(topRow, c, "─", BORDER_STYLE);
	}
	if (botRow > topRow && botRow < grid.rows) {
		grid.setChar(botRow, anchorCol, "└", BORDER_STYLE);
		grid.setChar(botRow, rightCol, "┘", BORDER_STYLE);
		for (let c = anchorCol + 1; c < rightCol; c++)
			grid.setChar(botRow, c, "─", BORDER_STYLE);
	}

	// 滚动溢出提示：嵌入上/下边框中央
	const hasAbove = scrollTop > 0;
	const hasBelow = scrollTop + visibleItems < labels.length;
	const midCol = anchorCol + Math.floor(boxWidth / 2);
	if (hasAbove && topRow >= 0 && topRow < grid.rows) {
		grid.setChar(topRow, midCol, "▲", BORDER_STYLE);
	}
	if (hasBelow && botRow > topRow && botRow < grid.rows) {
		grid.setChar(botRow, midCol, "▼", BORDER_STYLE);
	}

	for (let i = 0; i < visibleItems; i++) {
		const itemIdx = scrollTop + i;
		const row = topRow + 1 + i;
		if (row >= grid.rows || row >= botRow) break;
		if (itemIdx >= labels.length) break;
		grid.setChar(row, anchorCol, "│", BORDER_STYLE);
		grid.setChar(row, rightCol, "│", BORDER_STYLE);

		const style = itemIdx === selectedIndex ? highlightStyle : normalStyle;
		const chars = [...(labels[itemIdx] ?? "")];
		let charIdx = 0;
		for (let c = anchorCol + 1; c < rightCol; c++) {
			if (charIdx < chars.length) {
				const ch = chars[charIdx] ?? "";
				const w = charWidth(ch);
				if (w === 2 && c + 1 < rightCol) {
					grid.setWideChar(row, c, ch, style);
					c++;
					charIdx++;
				} else if (w === 2) {
					grid.setChar(row, c, " ", style);
				} else {
					grid.setChar(row, c, ch, style);
					charIdx++;
				}
			} else {
				grid.setChar(row, c, " ", style);
			}
		}
	}
}

/** 计算候选标签最大显示宽度（clamp 到上限） */
export function maxLabelWidth(labels: string[], cap: number): number {
	let max = 0;
	for (const l of labels) max = Math.max(max, stringWidth(l));
	return Math.min(Math.max(max, 8), cap);
}

// ── desc 描述框（与菜单联动）──

export interface DescBox {
	anchorRow: number;
	anchorCol: number;
	boxWidth: number;
	boxHeight: number;
}

/** 描述框最大宽度 */
export const DESC_MAX_WIDTH = 34;

/**
 * 计算描述框位置：紧贴菜单框，优先右侧，空间不够则左侧，都不够返回 null。
 * 高度与菜单框一致，顶部对齐。
 */
export function calcDescBox(menu: MenuBox, gridCols: number): DescBox | null {
	const menuRight = menu.anchorCol + menu.boxWidth;
	const rightSpace = gridCols - menuRight;
	const leftSpace = menu.anchorCol;

	if (rightSpace >= 8) {
		const boxWidth = Math.min(rightSpace, DESC_MAX_WIDTH);
		return {
			anchorRow: menu.anchorRow,
			anchorCol: menuRight,
			boxWidth,
			boxHeight: menu.boxHeight,
		};
	}
	if (leftSpace >= 8) {
		const boxWidth = Math.min(leftSpace, DESC_MAX_WIDTH);
		return {
			anchorRow: menu.anchorRow,
			anchorCol: menu.anchorCol - boxWidth,
			boxWidth,
			boxHeight: menu.boxHeight,
		};
	}
	return null;
}

/** 将文本按显示宽度折行到指定列宽（处理 CJK 宽字符），返回视觉行数组 */
export function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	const w = Math.max(1, width);
	for (const para of text.split("\n")) {
		let cur = "";
		let curW = 0;
		for (const ch of para) {
			const cw = charWidth(ch);
			if (curW + cw > w) {
				lines.push(cur);
				cur = ch;
				curW = cw;
			} else {
				cur += ch;
				curW += cw;
			}
		}
		lines.push(cur);
	}
	return lines;
}

/** 绘制带边框的描述框，内容折行；超过框高的行被截断 */
export function paintDescBox(
	grid: Grid,
	text: string,
	box: DescBox,
	textStyle: number,
): void {
	const { anchorRow, anchorCol, boxWidth, boxHeight } = box;
	const topRow = anchorRow;
	const botRow = anchorRow + boxHeight - 1;
	const rightCol = Math.min(anchorCol + boxWidth - 1, grid.cols - 1);
	const contentWidth = rightCol - anchorCol - 1;
	if (contentWidth < 1) return;

	if (topRow >= 0 && topRow < grid.rows) {
		grid.setChar(topRow, anchorCol, "┌", BORDER_STYLE);
		grid.setChar(topRow, rightCol, "┐", BORDER_STYLE);
		for (let c = anchorCol + 1; c < rightCol; c++)
			grid.setChar(topRow, c, "─", BORDER_STYLE);
	}
	if (botRow > topRow && botRow < grid.rows) {
		grid.setChar(botRow, anchorCol, "└", BORDER_STYLE);
		grid.setChar(botRow, rightCol, "┘", BORDER_STYLE);
		for (let c = anchorCol + 1; c < rightCol; c++)
			grid.setChar(botRow, c, "─", BORDER_STYLE);
	}

	const wrapped = wrapText(text, contentWidth);
	const contentRows = boxHeight - 2;
	for (let i = 0; i < contentRows; i++) {
		const row = topRow + 1 + i;
		if (row >= grid.rows || row >= botRow) break;
		grid.setChar(row, anchorCol, "│", BORDER_STYLE);
		grid.setChar(row, rightCol, "│", BORDER_STYLE);
		const line = wrapped[i] ?? "";
		let charIdx = 0;
		const chars = [...line];
		for (let c = anchorCol + 1; c < rightCol; c++) {
			if (charIdx < chars.length) {
				const ch = chars[charIdx] ?? "";
				const cw = charWidth(ch);
				if (cw === 2 && c + 1 < rightCol) {
					grid.setWideChar(row, c, ch, textStyle);
					c++;
					charIdx++;
				} else if (cw === 2) {
					grid.setChar(row, c, " ", textStyle);
				} else {
					grid.setChar(row, c, ch, textStyle);
					charIdx++;
				}
			} else {
				grid.setChar(row, c, " ", textStyle);
			}
		}
	}
}
