/**
 * multiline-input UI — 布局计算 + 绘制
 *
 * 封装动态区域的布局（输入区 + 状态栏）、宽字符写入、状态栏绘制（含宽度降级）。
 * reader.ts 负责输入循环与状态机，绘制细节集中在此。
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
/** 滚动指示行占用的行数（仅在有溢出时存在） */
export const INDICATOR_ROWS = 1;

export interface Layout {
	/** 输入区起始行（含） */
	inputStartRow: number;
	/** 输入区结束行（含） */
	inputEndRow: number;
	/** 滚动指示行（无则为 -1） */
	indicatorRow: number;
	/** 状态栏所在行 */
	statusRow: number;
}

export function getLayout(gridRows: number, hasIndicator = false): Layout {
	const statusRow = gridRows - 1;
	const indicatorRow = hasIndicator ? statusRow - INDICATOR_ROWS : -1;
	const inputEndRow = (hasIndicator ? indicatorRow : statusRow) - 1;
	return {
		inputStartRow: 0,
		inputEndRow,
		indicatorRow,
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
export function paintStatusBar(grid: Grid, ti: TextInput): void {
	const layout = getLayout(grid.rows);
	clearRow(grid, layout.statusRow);

	const chars = ti.text.length;
	const lines = ti.text.split("\n").length;
	const { line, col } = cursorLineCol(ti);

	const full = `Chars: ${chars} · Ln ${line}:${col} · Lines: ${lines}`;
	const short = `C:${chars} · ${line}:${col} · Ln:${lines}`;
	const min = `${line}:${col}`;

	const cols = grid.cols;
	let text: string;
	if (stringWidth(full) <= cols) text = full;
	else if (stringWidth(short) <= cols) text = short;
	else text = min;

	writeStr(grid, layout.statusRow, 0, text, statusStyle);
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

/** 绘制滚动指示行：`↑N 行  ↓M 行`，dim 样式。仅在 above/below 有值时绘制对应部分 */
export function paintScrollIndicator(
	grid: Grid,
	row: number,
	overflow: ScrollOverflow,
): void {
	if (row < 0 || row >= grid.rows) return;
	clearRow(grid, row);
	const parts: string[] = [];
	if (overflow.above > 0) parts.push(`↑${overflow.above} 行`);
	if (overflow.below > 0) parts.push(`↓${overflow.below} 行`);
	if (parts.length === 0) return;
	writeStr(grid, row, 0, parts.join("  "), statusStyle);
}
