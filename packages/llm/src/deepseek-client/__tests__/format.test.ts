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
							tool: "post",
							args: { uri: "write://.", body: "ls" },
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
							name: "post",
							arguments: '{"uri":"write://.","body":"ls"}',
						},
					},
				],
			},
		]);
	});

	test("reasoning 原样保留不改写", () => {
		expect(
			toDeepSeekMessages([
				{
					role: "assistant",
					content: "Done.",
					reasoning: "Let me inspect the file first.",
				},
				{
					role: "assistant",
					content: "完成。",
					reasoning: "让我检查一下日志。",
				},
			]),
		).toEqual([
			{
				role: "assistant",
				content: "Done.",
				reasoning_content: "Let me inspect the file first.",
			},
			{
				role: "assistant",
				content: "完成。",
				reasoning_content: "让我检查一下日志。",
			},
		]);
	});
});
