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
});
