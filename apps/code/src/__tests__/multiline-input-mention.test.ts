/**
 * @mention 菜单测试
 *
 * 纯逻辑（detectMention/filterMentions/mentionLabel）+ 端到端（触发→选中→插入）。
 */

import { describe, expect, test } from "bun:test";
import {
	detectMention,
	filterMentions,
	mentionLabel,
	type MentionItem,
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
