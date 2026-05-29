/**
 * multiline-input UI — 布局计算 + 绘制
 *
 * 封装动态区域的布局（输入区 + 状态栏 + 上下滚动指示器）、宽字符写入、
 * 状态栏绘制（含宽度降级）。reader.ts 负责输入循环与状态机，绘制细节集中在此。
 *
 * 指示器布局：上溢出指示行贴输入区顶部、下溢出指示行贴输入区底部，
 * 各自独立出现/隐藏（最多占 2 行）。
 */

import {
	charWidth,
	DIM,
	encodeStyle,
	type Grid,
	stringWidth,
	type TextInput,
} from "@xlxz/terminal-renderer";

// ── 样式 ──
/** 状态栏：暗灰 */
const statusStyle = encodeStyle(-1, -1, DIM);

// ── 布局 ──

/** 状态栏占用的行数 */
export const STATUS_ROWS = 1;
/** 滚动指示行最多占用的行数（上 + 下各 1 行） */
export const INDICATOR_ROWS = 2;

export interface Layout {
	/** 输入区起始行（含） */
	inputStartRow: number;
	/** 输入区结束行（含） */
	inputEndRow: number;
	/** 上方溢出指示行（无则为 -1） */
	aboveIndicatorRow: number;
	/** 下方溢出指示行（无则为 -1） */
	belowIndicatorRow: number;
	/** 状态栏所在行 */
	statusRow: number;
}

/**
 * 计算各区域的行范围。
 *
 * 上方指示行（如有）在 row 0；下方指示行（如有）紧贴状态栏上方。
 * 输入区夹在上下指示行之间。
 */
export function getLayout(
	gridRows: number,
	hasAbove: boolean,
	hasBelow: boolean,
): Layout {
	const statusRow = gridRows - 1;
	const aboveIndicatorRow = hasAbove ? 0 : -1;
	const inputStartRow = hasAbove ? 1 : 0;
	const belowIndicatorRow = hasBelow ? statusRow - 1 : -1;
	const inputEndRow = (hasBelow ? belowIndicatorRow : statusRow) - 1;
	return {
		inputStartRow,
		inputEndRow,
		aboveIndicatorRow,
		belowIndicatorRow,
		statusRow,
	};
}

// ── 宽字符写入 ──

/** 向 grid 指定位置写入字符串，处理 CJK 宽字符；返回写入后的列位置 */
export function writeStr(
	grid: Grid,
	row: number,
	col: number,
	text: string,
	style: number,
): number {
	let c = col;
	for (const ch of text) {
		if (c >= grid.cols) break;
		const w = charWidth(ch);
		if (w === 2) {
			if (c + 1 < grid.cols) {
				grid.setWideChar(row, c, ch, style);
				c += 2;
			} else {
				grid.setChar(row, c, " ", 0);
				c++;
			}
		} else {
			grid.setChar(row, c, ch, style);
			c++;
		}
	}
	return c;
}

/** 用空格清除一整行 */
export function clearRow(grid: Grid, row: number, style = 0): void {
	for (let c = 0; c < grid.cols; c++) grid.setChar(row, c, " ", style);
}

// ── 视觉行数 ──

/** 计算文本在给定宽度下占用的视觉行数（含换行 + CJK 折行） */
export function countVisualLines(text: string, cols: number): number {
	const width = Math.max(1, cols);
	let lines = 0;
	let start = 0;
	for (let i = 0; i <= text.length; i++) {
		if (i === text.length || text[i] === "\n") {
			const seg = text.slice(start, i);
			const w = stringWidth(seg);
			lines += Math.max(1, Math.ceil(w / width));
			start = i + 1;
		}
	}
	return Math.max(1, lines);
}

// ── 状态栏 ──

/** 当前光标的逻辑行号（1-based）和列号（1-based，按 code point） */
function cursorLineCol(ti: TextInput): { line: number; col: number } {
	const before = ti.text.slice(0, ti.cursorOffset);
	const parts = before.split("\n");
	const line = parts.length;
	const col = [...(parts[parts.length - 1] ?? "")].length + 1;
	return { line, col };
}

/**
 * 绘制状态栏，宽度不足时逐级降级。
 *
 * 三档：
 *  - 完整：`Chars: N · Ln L:C · Lines: M`
 *  - 简写：`C:N · L:C · Ln:M`
 *  - 最小：`L:C`
 */
export function paintStatusBar(
	grid: Grid,
	ti: TextInput,
	statusRow: number,
	startCol = 0,
): void {
	clearRow(grid, statusRow);

	const chars = ti.text.length;
	const lines = ti.text.split("\n").length;
	const { line, col } = cursorLineCol(ti);

	const full = `Chars: ${chars} · Ln ${line}:${col} · Lines: ${lines}`;
	const short = `C:${chars} · ${line}:${col} · Ln:${lines}`;
	const min = `${line}:${col}`;

	const cols = grid.cols - startCol;
	let text: string;
	if (stringWidth(full) <= cols) text = full;
	else if (stringWidth(short) <= cols) text = short;
	else text = min;

	writeStr(grid, statusRow, startCol, text, statusStyle);
}

// ── 滚动溢出指示 ──

export interface ScrollOverflow {
	/** 可见窗口上方被隐藏的视觉行数 */
	above: number;
	/** 可见窗口下方被隐藏的视觉行数 */
	below: number;
}

/** 计算从 offset 起、文本前段占用的视觉行数（与 TextInput.paint 折行一致） */
function visualLinesBefore(text: string, offset: number, cols: number): number {
	const w = Math.max(1, cols);
	let lines = 0;
	let colW = 0;
	const end = Math.min(offset, text.length);
	for (let i = 0; i < end; i++) {
		const ch = text[i] ?? "";
		if (ch === "\n") {
			lines++;
			colW = 0;
			continue;
		}
		const cw = charWidth(ch);
		if (colW + cw > w) {
			lines++;
			colW = cw;
		} else {
			colW += cw;
		}
	}
	return lines;
}

/**
 * 计算输入区上下被隐藏的视觉行数。
 *
 * @param scrollOffset TextInput 当前视口首字符的 code unit offset
 * @param visibleRows 输入区可见行数
 */
export function calcScrollOverflow(
	text: string,
	scrollOffset: number,
	cols: number,
	visibleRows: number,
): ScrollOverflow {
	const total = countVisualLines(text, cols);
	const above = visualLinesBefore(text, scrollOffset, cols);
	const shown = Math.max(0, Math.min(visibleRows, total - above));
	const below = Math.max(0, total - above - shown);
	return { above, below };
}

/** 绘制上方溢出指示行：`↑N 行`，dim 样式 */
export function paintAboveIndicator(
	grid: Grid,
	row: number,
	count: number,
	startCol = 0,
): void {
	if (row < 0 || row >= grid.rows || count <= 0) return;
	clearRow(grid, row);
	writeStr(grid, row, startCol, `↑${count} 行`, statusStyle);
}

/** 绘制下方溢出指示行：`↓N 行`，dim 样式 */
export function paintBelowIndicator(
	grid: Grid,
	row: number,
	count: number,
	startCol = 0,
): void {
	if (row < 0 || row >= grid.rows || count <= 0) return;
	clearRow(grid, row);
	writeStr(grid, row, startCol, `↓${count} 行`, statusStyle);
}

// ── 列布局（align / max-width）──

export type EditorAlign = "left" | "center" | "right";

export interface ColSpan {
	/** 输入区起始列（含） */
	startCol: number;
	/** 输入区列宽 */
	width: number;
	/** 输入区结束列（不含） */
	endCol: number;
}

/**
 * 根据终端列数、最大宽度、对齐方式计算输入区的列起止。
 * maxWidth 为 null 或 ≤0 表示无限制（占满终端宽度）。
 * maxWidth 超过终端宽度时退化为占满。
 */
export function calcColSpan(
	termCols: number,
	maxWidth: number | null,
	align: EditorAlign,
): ColSpan {
	const width =
		maxWidth && maxWidth > 0 ? Math.min(maxWidth, termCols) : termCols;
	let startCol: number;
	if (align === "center") startCol = Math.floor((termCols - width) / 2);
	else if (align === "right") startCol = termCols - width;
	else startCol = 0;
	if (startCol < 0) startCol = 0;
	return { startCol, width, endCol: startCol + width };
}

// ── 侧边框 + 花纹填充（输入框受 maxWidth 约束、左右出现空白时）──

/** 边框样式：暗灰竖线 */
const borderStyle = encodeStyle(-1, -1, DIM);
/** 花纹样式：暗灰 */
const patternStyle = encodeStyle(-1, -1, DIM);
/** 花纹字符，按 (row+col) 交替 */
const PATTERN_CHARS = ["░", "▒"] as const;

function patternAt(row: number, col: number): string {
	return PATTERN_CHARS[(row + col) % PATTERN_CHARS.length] as string;
}

/**
 * 当输入框因 maxWidth 受限、左右出现空白边距时，在输入区外侧绘制竖边框，
 * 并用 dim 花纹填充剩余边距。按对齐方式自然生效：
 *  - left：仅右侧有边距 → 右边框 + 右花纹
 *  - right：仅左侧有边距 → 左边框 + 左花纹
 *  - center：两侧都有 → 两边框 + 两花纹
 * 无边距（占满终端）时此函数不绘制任何内容。
 *
 * 覆盖动态区全部行，使边框/花纹在视觉上连续（含输入区、指示行、状态栏行）。
 */
export function paintSideFrame(grid: Grid, span: ColSpan): void {
	const cols = grid.cols;
	const hasLeft = span.startCol > 0;
	const hasRight = span.endCol < cols;
	if (!hasLeft && !hasRight) return;

	for (let r = 0; r < grid.rows; r++) {
		if (hasLeft) {
			// 左花纹 [0, startCol-1)，左边框列 startCol-1
			for (let c = 0; c < span.startCol - 1; c++) {
				grid.setChar(r, c, patternAt(r, c), patternStyle);
			}
			grid.setChar(r, span.startCol - 1, "│", borderStyle);
		}
		if (hasRight) {
			// 右边框列 endCol，右花纹 (endCol, cols)
			grid.setChar(r, span.endCol, "│", borderStyle);
			for (let c = span.endCol + 1; c < cols; c++) {
				grid.setChar(r, c, patternAt(r, c), patternStyle);
			}
		}
	}
}
