/**
 * 状态栏宽度降级 + 上下滚动溢出指示测试
 *
 * 上下指示器分开：上溢出贴输入区顶部、下溢出贴输入区底部，各自独立出现/隐藏。
 */

import { describe, expect, test } from "bun:test";
import { Grid, TextInput } from "@xlxz/terminal-renderer";
import {
	calcColSpan,
	calcScrollOverflow,
	getLayout,
	paintAboveIndicator,
	paintBelowIndicator,
	paintSideFrame,
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

describe("calcColSpan", () => {
	test("null maxWidth → full terminal width", () => {
		expect(calcColSpan(80, null, "left")).toEqual({
			startCol: 0,
			width: 80,
			endCol: 80,
		});
	});

	test("maxWidth=60, center on 80 col terminal → startCol=10, width=60", () => {
		expect(calcColSpan(80, 60, "center")).toEqual({
			startCol: 10,
			width: 60,
			endCol: 70,
		});
	});

	test("maxWidth=60, right on 80 col terminal → startCol=20, width=60", () => {
		expect(calcColSpan(80, 60, "right")).toEqual({
			startCol: 20,
			width: 60,
			endCol: 80,
		});
	});

	test("maxWidth=100 on 80 col terminal → clamped to 80, startCol=0", () => {
		expect(calcColSpan(80, 100, "left")).toEqual({
			startCol: 0,
			width: 80,
			endCol: 80,
		});
	});
});

describe("paintSideFrame 侧边框 + 花纹", () => {
	function readRow(grid: GridLike, row: number): string {
		let s = "";
		for (let c = 0; c < grid.cols; c++) s += grid.charAt(row, c);
		return s;
	}

	test("无边距（占满终端）时不绘制任何内容", () => {
		const grid = Grid.create(20, 3);
		paintSideFrame(grid, { startCol: 0, width: 20, endCol: 20 });
		expect(readRow(grid as unknown as GridLike, 0).trim()).toBe("");
	});

	test("left 对齐（仅右边距）：右边框 + 右花纹，左侧不动", () => {
		const grid = Grid.create(20, 2);
		// startCol=0, endCol=14 → 右边距 [14,20)
		paintSideFrame(grid, { startCol: 0, width: 14, endCol: 14 });
		// endCol 列是边框竖线
		expect(grid.charAt(0, 14)).toBe("│");
		// 右花纹区 (14,20) 为花纹字符（░ 或 ▒）
		for (let c = 15; c < 20; c++) {
			expect(["░", "▒"]).toContain(grid.charAt(0, c));
		}
		// 左侧（输入区）未被写入花纹/边框
		expect(grid.charAt(0, 0)).not.toBe("│");
	});

	test("center 对齐（两侧边距）：两侧各有边框 + 花纹", () => {
		const grid = Grid.create(20, 2);
		// startCol=5, endCol=15 → 左边距 [0,4)+边框列4，右边框列15+花纹(15,20)
		paintSideFrame(grid, { startCol: 5, width: 10, endCol: 15 });
		expect(grid.charAt(0, 4)).toBe("│"); // 左边框列 startCol-1
		expect(grid.charAt(0, 15)).toBe("│"); // 右边框列 endCol
		// 左花纹 [0,4)
		for (let c = 0; c < 4; c++) expect(["░", "▒"]).toContain(grid.charAt(0, c));
		// 右花纹 (15,20)
		for (let c = 16; c < 20; c++)
			expect(["░", "▒"]).toContain(grid.charAt(0, c));
	});

	test("right 对齐（仅左边距）：左边框 + 左花纹，右侧不动", () => {
		const grid = Grid.create(20, 2);
		// startCol=6, endCol=20 → 仅左边距
		paintSideFrame(grid, { startCol: 6, width: 14, endCol: 20 });
		expect(grid.charAt(0, 5)).toBe("│"); // 左边框列 startCol-1
		for (let c = 0; c < 5; c++) expect(["░", "▒"]).toContain(grid.charAt(0, c));
		// 右侧无边框（endCol==cols）
		expect(grid.charAt(0, 19)).not.toBe("│");
	});
});
