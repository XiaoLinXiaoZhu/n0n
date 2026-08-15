import { describe, expect, test } from "bun:test";
import { toDeepSeekMessages } from "../format.ts";

describe("toDeepSeekMessages", () => {
	test("保留 system，并保留连续 user 消息", () => {
		expect(
			toDeepSeekMessages([
				{ role: "system", content: "base system" },
				{ role: "user", content: "skills" },
				{ role: "user", content: "actual request" },
			]),
		).toEqual([
			{ role: "system", content: "base system" },
			{ role: "user", content: "skills" },
			{ role: "user", content: "actual request" },
		]);
	});

	test("保留 reasoning_content 和工具调用", () => {
		expect(
			toDeepSeekMessages([
				{
					role: "assistant",
					content: "I will inspect the file.",
					reasoning: "Need to inspect first.",
					toolCalls: [
						{
							id: "call_1",
							tool: "observe",
							args: { script: "ls" },
						},
					],
				},
			]),
		).toEqual([
			{
				role: "assistant",
				content: "I will inspect the file.",
				reasoning_content: "Need to inspect first.",
				tool_calls: [
					{
						id: "call_1",
						type: "function",
						function: {
							name: "observe",
							arguments: '{"script":"ls"}',
						},
					},
				],
			},
		]);
	});

	test("reasoning 含 Let me 开头时应该替换为 We need to", () => {
		expect(
			toDeepSeekMessages([
				{
					role: "assistant",
					content: "Done.",
					reasoning: "Let me inspect the file first.",
				},
			]),
		).toEqual([
			{
				role: "assistant",
				content: "Done.",
				reasoning_content: "We need to inspect the file first.",
			},
		]);
	});

	test("reasoning 含中文 让我 时应该替换为 我们需要", () => {
		expect(
			toDeepSeekMessages([
				{
					role: "assistant",
					content: "完成。",
					reasoning: "让我检查一下日志。",
				},
			]),
		).toEqual([
			{
				role: "assistant",
				content: "完成。",
				reasoning_content: "我们需要检查一下日志。",
			},
		]);
	});
});
