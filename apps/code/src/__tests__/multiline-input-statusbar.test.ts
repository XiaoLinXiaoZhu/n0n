/**
 * 状态栏宽度降级 + 上下滚动溢出指示测试
 *
 * 上下指示器分开：上溢出贴输入区顶部、下溢出贴输入区底部，各自独立出现/隐藏。
 */

import { describe, expect, test } from "bun:test";
import { Grid, TextInput } from "@xlxz/terminal-renderer";
import {
	calcScrollOverflow,
	getLayout,
	paintAboveIndicator,
	paintBelowIndicator,
	paintStatusBar,
} from "../multiline-input/ui.ts";

interface GridLike {
	cols: number;
	charAt(row: number, col: number): string;
}

function readRow(grid: GridLike, row: number): string {
	let s = "";
	for (let c = 0; c < grid.cols; c++) s += grid.charAt(row, c);
	return s.replace(/\s+$/, "");
}

function paintAt(cols: number, text: string): string {
	const rows = 3;
	const grid = Grid.create(cols, rows);
	const ti = new TextInput();
	ti.text = text;
	ti.cursorOffset = text.length;
	const layout = getLayout(rows, false, false);
	paintStatusBar(grid, ti, layout.statusRow);
	return readRow(grid as unknown as GridLike, layout.statusRow);
}

describe("状态栏宽度降级", () => {
	test("宽终端显示完整字段", () => {
		expect(paintAt(80, "hello\nworld")).toBe("Chars: 11 · Ln 2:6 · Lines: 2");
	});

	test("中等宽度降级为简写", () => {
		expect(paintAt(20, "hello\nworld")).toBe("C:11 · 2:6 · Ln:2");
	});

	test("极窄宽度降级为最小（仅光标行列）", () => {
		expect(paintAt(8, "hello\nworld")).toBe("2:6");
	});
});

describe("getLayout 上下指示行独立", () => {
	test("无指示行时输入区占满状态栏上方所有行", () => {
		const l = getLayout(5, false, false);
		expect(l).toEqual({
			inputStartRow: 0,
			inputEndRow: 3,
			aboveIndicatorRow: -1,
			belowIndicatorRow: -1,
			statusRow: 4,
		});
	});

	test("仅上溢出：上指示行在 row 0，输入区从 row 1 开始", () => {
		const l = getLayout(5, true, false);
		expect(l).toEqual({
			inputStartRow: 1,
			inputEndRow: 3,
			aboveIndicatorRow: 0,
			belowIndicatorRow: -1,
			statusRow: 4,
		});
	});

	test("仅下溢出：下指示行在状态栏上方，输入区缩 1 行", () => {
		const l = getLayout(5, false, true);
		expect(l).toEqual({
			inputStartRow: 0,
			inputEndRow: 2,
			aboveIndicatorRow: -1,
			belowIndicatorRow: 3,
			statusRow: 4,
		});
	});

	test("上下同时溢出：各占 1 行", () => {
		const l = getLayout(6, true, true);
		expect(l).toEqual({
			inputStartRow: 1,
			inputEndRow: 3,
			aboveIndicatorRow: 0,
			belowIndicatorRow: 4,
			statusRow: 5,
		});
	});
});

describe("calcScrollOverflow", () => {
	const text = "L0\nL1\nL2\nL3\nL4"; // 5 视觉行（不折行）

	test("从顶部起、可见行覆盖全部时无溢出", () => {
		expect(calcScrollOverflow(text, 0, 80, 5)).toEqual({ above: 0, below: 0 });
	});

	test("从顶部起、可见行不足时只有下溢出", () => {
		// 可见 2 行，全文 5 行 → 下方隐藏 3 行
		expect(calcScrollOverflow(text, 0, 80, 2)).toEqual({ above: 0, below: 3 });
	});

	test("视口下移后上下都有溢出", () => {
		// scrollOffset 指向 "L2" 起点 = "L0\nL1\n".length = 6，可见 2 行
		// above=2，shown=2，below=5-2-2=1
		expect(calcScrollOverflow(text, 6, 80, 2)).toEqual({ above: 2, below: 1 });
	});

	test("折行也计入视觉行（窄列宽）", () => {
		// "aaaa" 在宽 2 列折成 2 视觉行
		expect(calcScrollOverflow("aaaa", 0, 2, 1)).toEqual({ above: 0, below: 1 });
	});
});

describe("上下指示器绘制", () => {
	function readIndicatorLine(
		cols: number,
		paint: (grid: Grid, row: number) => void,
	): string {
		const grid = Grid.create(cols, 3);
		paint(grid, 1);
		let s = "";
		for (let c = 0; c < cols; c++) s += grid.charAt(1, c);
		return s.replace(/\s+$/, "");
	}

	test("上方指示行：↑N 行", () => {
		expect(readIndicatorLine(40, (g, r) => paintAboveIndicator(g, r, 3))).toBe(
			"↑3 行",
		);
	});

	test("下方指示行：↓N 行", () => {
		expect(readIndicatorLine(40, (g, r) => paintBelowIndicator(g, r, 2))).toBe(
			"↓2 行",
		);
	});

	test("count 为 0 时不上色", () => {
		expect(readIndicatorLine(40, (g, r) => paintAboveIndicator(g, r, 0))).toBe(
			"",
		);
	});

	test("行号越界不上色", () => {
		const grid = Grid.create(40, 3);
		paintAboveIndicator(grid, -1, 3);
		paintAboveIndicator(grid, 99, 3);
		// 不应抛异常
	});
});
