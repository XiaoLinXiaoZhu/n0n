/**
 * multiline-input @mention — skill 补全菜单
 *
 * 数据源：@n0n/skill 的 listSkills()（auto + manual 类别）。
 * 触发：光标所在逻辑行以 @ 开头（行首）。
 * 绘制：带边框的候选菜单，锚定在光标下方。
 *
 * 第三步将在此基础上增加 desc 描述框双框联动。
 */

import { charWidth, type Grid, stringWidth } from "@xlxz/terminal-renderer";

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

	const belowRows = gridRows - cursorRow - 1;
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

/** 为菜单区域设置 ownership（覆盖输入区） */
export function setupMenuOwnership(
	grid: Grid,
	box: MenuBox,
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
