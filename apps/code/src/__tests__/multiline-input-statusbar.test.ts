/**
 * 状态栏宽度降级测试
 *
 * 直接在不同宽度的 Grid 上 paint，读回状态栏行内容，验证三档降级。
 */

import { Grid, TextInput } from "@xlxz/terminal-renderer";
import { describe, expect, test } from "bun:test";
import { getLayout, paintStatusBar } from "../multiline-input/ui.ts";

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
