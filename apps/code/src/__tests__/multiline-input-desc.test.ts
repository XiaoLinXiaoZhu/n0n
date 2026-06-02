/**
 * @mention desc 描述框测试
 *
 * 验证中文折行、择侧定位、描述框渲染。
 */

import { describe, expect, test } from "bun:test";
import { Grid } from "@xlxz/terminal-renderer";
import {
	calcDescBox,
	type MenuBox,
	paintDescBox,
	wrapText,
} from "../multiline-input/mention.ts";

describe("wrapText 中文折行", () => {
	test("按显示宽度折行（中文宽 2）", () => {
		expect(wrapText("这是一段较长的中文描述文本", 6)).toEqual([
			"这是一",
			"段较长",
			"的中文",
			"描述文",
			"本",
		]);
	});

	test("保留换行符分段", () => {
		expect(wrapText("ab\ncd", 10)).toEqual(["ab", "cd"]);
	});
});

describe("calcDescBox 择侧", () => {
	const menuLeft: MenuBox = {
		anchorRow: 2,
		anchorCol: 2,
		boxWidth: 20,
		boxHeight: 6,
		visibleItems: 4,
	};

	test("右侧空间充足时放右侧", () => {
		const box = calcDescBox(menuLeft, 80);
		expect(box).not.toBeNull();
		expect(box?.anchorCol).toBe(22);
		expect(box?.anchorRow).toBe(2);
		expect(box?.boxHeight).toBe(6);
	});

	test("右侧空间不足时放左侧", () => {
		const menuRight: MenuBox = {
			anchorRow: 2,
			anchorCol: 58,
			boxWidth: 20,
			boxHeight: 6,
			visibleItems: 4,
		};
		const box = calcDescBox(menuRight, 80);
		expect(box).not.toBeNull();
		expect(box?.anchorCol).toBe(24);
	});

	test("两侧都不够时返回 null", () => {
		const menuWide: MenuBox = {
			anchorRow: 2,
			anchorCol: 3,
			boxWidth: 74,
			boxHeight: 6,
			visibleItems: 4,
		};
		expect(calcDescBox(menuWide, 80)).toBeNull();
	});
});

describe("paintDescBox 渲染", () => {
	test("描述文本渲染到框内", () => {
		const grid = Grid.create(80, 10);
		const box = { anchorRow: 2, anchorCol: 22, boxWidth: 34, boxHeight: 6 };
		paintDescBox(grid, "强制高频逐步执行模式", box, 0);
		let line = "";
		for (let c = box.anchorCol + 1; c < box.anchorCol + box.boxWidth - 1; c++) {
			line += grid.charAt(box.anchorRow + 1, c);
		}
		expect(line.replace(/\s+$/, "")).toBe("强制高频逐步执行模式");
	});
});
