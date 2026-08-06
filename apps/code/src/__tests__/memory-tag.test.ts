import { describe, expect, test } from "bun:test";
import type { DomainMessage } from "@n0n/types";
import { applyMemoryTags } from "../memory-tag.ts";

describe("applyMemoryTags", () => {
	test("包裹 assistant content 与 reasoning，不修改其他消息", () => {
		const messages: DomainMessage[] = [
			{ type: "generic_user_text", content: "hello" },
			{
				type: "assistant_text",
				content: "answer",
				reasoning: { ok: true, value: "think" },
				reasoningSignature: "sig",
			},
		];

		expect(applyMemoryTags(messages)).toEqual([
			{ type: "generic_user_text", content: "hello" },
			{
				type: "assistant_text",
				content: "<memory>\nanswer\n</memory>",
				reasoning: { ok: true, value: "<memory>\nthink\n</memory>" },
				reasoningSignature: "sig",
			},
		]);
		expect(messages[1]).toEqual({
			type: "assistant_text",
			content: "answer",
			reasoning: { ok: true, value: "think" },
			reasoningSignature: "sig",
		});
	});

	test("tool call 的 null content 和空 reasoning 保持原样", () => {
		const messages: DomainMessage[] = [
			{
				type: "assistant_tool_call",
				content: null,
				reasoning: { ok: false },
				reasoningSignature: undefined,
				toolCalls: [],
			},
		];

		expect(applyMemoryTags(messages)).toEqual(messages);
	});

	test("空 assistant content 不生成空 memory 标签", () => {
		const messages: DomainMessage[] = [
			{
				type: "assistant_text",
				content: "",
				reasoning: { ok: false },
			},
		];

		expect(applyMemoryTags(messages)).toEqual(messages);
	});
});
