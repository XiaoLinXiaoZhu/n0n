import { describe, expect, test } from "bun:test";
import { rewriteParagraphs } from "../utils.ts";

describe("rewriteParagraphs", () => {
	test("每段开头为 Let me 时应该替换为 We need to", () => {
		expect(
			rewriteParagraphs("Let me analyze the code.\nLet me check the logs."),
		).toBe("We need to analyze the code.\nWe need to check the logs.");
	});

	test("段内所有出现处都应该被替换", () => {
		expect(
			rewriteParagraphs(
				"First, let me read the file. Then let me write the fix.",
			),
		).toBe("First, We need to read the file. Then We need to write the fix.");
	});

	test("Let's 和 Let us 应该替换为 We need to", () => {
		expect(rewriteParagraphs("Let's think about this.\nLet us begin.")).toBe(
			"We need to think about this.\nWe need to begin.",
		);
	});

	test("大小写变体应该被识别并替换", () => {
		expect(rewriteParagraphs("let me try.\nLET ME try.\nlet's see.")).toBe(
			"We need to try.\nWe need to try.\nWe need to see.",
		);
	});

	test("中文 让我 和 让我来 应该替换为 我们需要", () => {
		expect(rewriteParagraphs("让我检查一下。\n让我来帮你。")).toBe(
			"我们需要检查一下。\n我们需要帮你。",
		);
	});

	test("段中出现的 让我来 也应该被替换", () => {
		expect(rewriteParagraphs("请你让我来接手。")).toBe("请你我们需要接手。");
	});

	test("未命中的文段和空行应该保持不变", () => {
		const input = "Nothing here.\n\nWe need to keep this.";
		expect(rewriteParagraphs(input)).toBe(input);
	});

	test("单词内部含 Let me 的文本不应该被替换", () => {
		expect(rewriteParagraphs("Let meander freely.")).toBe(
			"Let meander freely.",
		);
	});

	test("重复调用应该得到相同结果", () => {
		const once = rewriteParagraphs("Let me check.\n让我看看。");
		expect(rewriteParagraphs(once)).toBe(once);
	});
});
