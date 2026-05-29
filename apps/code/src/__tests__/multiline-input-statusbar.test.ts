/**
 * 状态栏宽度降级 + 滚动溢出指示测试
 */

import { Grid, TextInput } from "@xlxz/terminal-renderer";
import { describe, expect, test } from "bun:test";
import {
	calcScrollOverflow,
	getLayout,
	paintScrollIndicator,
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
	paintStatusBar(grid, ti);
	return readRow(grid as unknown as GridLike, getLayout(rows).statusRow);
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

describe("getLayout 指示行", () => {
	test("无指示行时 indicatorRow 为 -1，输入区到状态栏上一行", () => {
		const l = getLayout(5, false);
		expect(l).toEqual({
			inputStartRow: 0,
			inputEndRow: 3,
			indicatorRow: -1,
			statusRow: 4,
		});
	});

	test("有指示行时输入区让出 1 行，指示行在状态栏上方", () => {
		const l = getLayout(5, true);
		expect(l).toEqual({
			inputStartRow: 0,
			inputEndRow: 2,
			indicatorRow: 3,
			statusRow: 4,
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

describe("paintScrollIndicator", () => {
	function readIndicator(cols: number, above: number, below: number): string {
		const grid = Grid.create(cols, 3);
		paintScrollIndicator(grid, 1, { above, below });
		let s = "";
		for (let c = 0; c < cols; c++) s += grid.charAt(1, c);
		return s.replace(/\s+$/, "");
	}

	test("上下都有溢出时同时显示", () => {
		expect(readIndicator(40, 3, 2)).toBe("↑3 行  ↓2 行");
	});

	test("仅下溢出时只显示下", () => {
		expect(readIndicator(40, 0, 2)).toBe("↓2 行");
	});

	test("无溢出时整行为空", () => {
		expect(readIndicator(40, 0, 0)).toBe("");
	});
});
