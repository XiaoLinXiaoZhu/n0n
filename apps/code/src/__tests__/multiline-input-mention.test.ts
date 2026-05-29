/**
 * @mention 菜单测试
 *
 * 纯逻辑（detectMention/filterMentions/mentionLabel）+ 端到端（触发→选中→插入）。
 */

import { describe, expect, test } from "bun:test";
import {
	calcMenuPosition,
	calcMenuScrollTop,
	computeMentionDecorations,
	detectMention,
	filterMentions,
	type MentionItem,
	mentionLabel,
} from "../multiline-input/mention.ts";
import { readMultilineInput } from "../multiline-input/reader.ts";

describe("detectMention 行首触发", () => {
	test("行首 @ 触发并提取 query", () => {
		expect(detectMention("@ste", 4)).toEqual({ query: "ste", lineStart: 0 });
	});

	test("行中 @ 不触发", () => {
		expect(detectMention("hi @ste", 7)).toBeNull();
	});

	test("@ 后含空格不触发", () => {
		expect(detectMention("@ste foo", 8)).toBeNull();
	});

	test("第二行行首 @ 触发", () => {
		expect(detectMention("hi\n@re", 6)).toEqual({ query: "re", lineStart: 3 });
	});

	test("无 @ 不触发", () => {
		expect(detectMention("hello", 5)).toBeNull();
	});
});

describe("filterMentions", () => {
	const items: MentionItem[] = [
		{ name: "step", alias: [], description: "d1" },
		{ name: "research", alias: ["re"], description: "d2" },
		{ name: "ask", alias: [], description: "d3" },
	];

	test("空 query 返回全部", () => {
		expect(filterMentions(items, "").length).toBe(3);
	});

	test("按 name 子串匹配", () => {
		expect(filterMentions(items, "st").map((i) => i.name)).toEqual(["step"]);
	});

	test("按 alias 匹配", () => {
		expect(filterMentions(items, "re").map((i) => i.name)).toEqual([
			"research",
		]);
	});
});

describe("mentionLabel", () => {
	test("无 alias 仅 name", () => {
		expect(mentionLabel({ name: "step", alias: [], description: "" })).toBe(
			"step",
		);
	});

	test("有 alias 附在方括号", () => {
		expect(
			mentionLabel({ name: "research", alias: ["re"], description: "" }),
		).toBe("research [re]");
	});
});

describe("端到端：@ 触发菜单并选中插入", () => {
	function makeFakeOut() {
		const out = {
			columns: 80,
			rows: 24,
			write: () => true,
			on: () => out,
			removeListener: () => out,
		};
		return out as unknown as NodeJS.WriteStream;
	}

	test("输入 @st 后 enter 选中插入一个 @skill", async () => {
		let h: ((d: string) => void) | null = null;
		const p = readMultilineInput({
			output: makeFakeOut(),
			connectStdin: (x) => {
				h = x;
				return () => {};
			},
		});
		await new Promise((r) => setTimeout(r, 300));
		const send = (s: string) => h?.(s);
		send("@");
		send("s");
		send("t");
		send("\r"); // 菜单打开时 enter = 选中插入
		send("\x04"); // Ctrl+D 提交
		const r = await p;
		expect(r).not.toBeNull();
		expect(r?.text).toMatch(/^@[a-z0-9-]+$/);
	});
});

describe("computeMentionDecorations 行首 @token 高亮", () => {
	test("单个行首 @token 生成区间", () => {
		expect(computeMentionDecorations("@step")).toEqual([
			{ start: 0, end: 5, style: expect.any(Number) },
		]);
	});

	test("token 到首个空格为止", () => {
		expect(computeMentionDecorations("@step foo")[0]).toMatchObject({
			start: 0,
			end: 5,
		});
	});

	test("行中 @ 不高亮", () => {
		expect(computeMentionDecorations("hi @step")).toEqual([]);
	});

	test("多行各自行首 @token 用绝对 offset", () => {
		expect(computeMentionDecorations("ab\n@x\n@yy")).toMatchObject([
			{ start: 3, end: 5 },
			{ start: 6, end: 9 },
		]);
	});

	test("编辑后重算免疫错位：@token 前插入内容后区间随之平移", () => {
		const before = computeMentionDecorations("@step");
		const after = computeMentionDecorations("new\n@step");
		expect(before[0]?.start).toBe(0);
		expect(after[0]?.start).toBe(4);
		expect(after[0]?.end).toBe(9);
	});
});

describe("calcMenuScrollTop 滚动窗口", () => {
	test("项数不超过可见数时不滚动", () => {
		expect(calcMenuScrollTop(2, 8, 3)).toBe(0);
	});

	test("选中靠前时窗口贴顶", () => {
		expect(calcMenuScrollTop(1, 4, 10)).toBe(0);
	});

	test("选中居中时窗口跟随", () => {
		expect(calcMenuScrollTop(5, 4, 10)).toBe(3);
	});

	test("选中末项时窗口贴底（不越界）", () => {
		expect(calcMenuScrollTop(9, 4, 10)).toBe(6);
	});

	test("任意选中项都落在可见窗口内", () => {
		const visible = 4;
		const count = 10;
		for (let sel = 0; sel < count; sel++) {
			const top = calcMenuScrollTop(sel, visible, count);
			expect(sel).toBeGreaterThanOrEqual(top);
			expect(sel).toBeLessThan(top + visible);
		}
	});
});

describe("calcMenuPosition 底边框避让状态栏行", () => {
	// gridRows 含最后一行状态栏；菜单底边框 botRow 不应 >= statusRow(gridRows-1)
	test("下方空间恰好时菜单不裁切到状态栏行", () => {
		// gridRows=11, cursorRow=2, 6 项 → boxHeight=8
		// 修复前 belowRows=8 会判定 fits，botRow=10=statusRow 被裁
		const box = calcMenuPosition(11, 40, 2, 0, 6, 20);
		expect(box).not.toBeNull();
		const statusRow = 11 - 1;
		const botRow =
			(box as { anchorRow: number; boxHeight: number }).anchorRow +
			(box as { boxHeight: number }).boxHeight -
			1;
		expect(botRow).toBeLessThan(statusRow);
	});

	test("下方空间充足时完整展开且不撞状态栏", () => {
		// gridRows=12, cursorRow=2, 6 项 → boxHeight=8, 完整
		const box = calcMenuPosition(12, 40, 2, 0, 6, 20);
		expect(box).not.toBeNull();
		expect(box?.boxHeight).toBe(8);
		expect(box?.anchorRow).toBe(3);
		const botRow =
			(box as { anchorRow: number }).anchorRow + (box?.boxHeight ?? 0) - 1;
		expect(botRow).toBeLessThan(12 - 1);
	});

	test("下方不足转上方时不裁切", () => {
		// cursorRow 靠下，下方空间不足，转上方
		const box = calcMenuPosition(14, 40, 11, 0, 6, 20);
		expect(box).not.toBeNull();
		expect(box?.anchorRow).toBeGreaterThanOrEqual(0);
	});
});
