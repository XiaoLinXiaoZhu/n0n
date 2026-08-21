import { describe, expect, test } from "bun:test";
import { toResponseInput, toResponseTools } from "../format.ts";
import { encodeResponseSignature } from "../signature.ts";

describe("toResponseInput", () => {
	test("展开签名中的原始 output items，并将工具参数与领域历史对齐", () => {
		const signature = encodeResponseSignature([
			{
				type: "reasoning",
				id: "rs_1",
				encrypted_content: "opaque",
				summary: [],
			},
			{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "old_name",
				arguments: '{"partial":true}',
			},
		]);

		expect(
			toResponseInput([
				{ role: "system", content: "system" },
				{ role: "user", content: "inspect" },
				{
					role: "assistant",
					content: "",
					reasoningSignature: signature,
					toolCalls: [
						{
							id: "call_1",
							tool: "observe",
							args: { path: "README.md" },
						},
					],
				},
				{
					role: "tool",
					toolCallId: "call_1",
					toolName: "observe",
					content: "file contents",
				},
			]),
		).toEqual([
			{ role: "system", content: "system" },
			{ role: "user", content: "inspect" },
			{
				type: "reasoning",
				id: "rs_1",
				encrypted_content: "opaque",
				summary: [],
			},
			{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "observe",
				arguments: '{"path":"README.md"}',
			},
			{
				type: "function_call_output",
				call_id: "call_1",
				output: "file contents",
			},
		]);
	});

	test("没有本 provider 签名时从通用 assistant 消息重建", () => {
		expect(
			toResponseInput([
				{
					role: "assistant",
					content: "working",
					reasoningSignature: "some-other-provider",
					toolCalls: [{ id: "call_2", tool: "reason", args: { input: "x" } }],
				},
			]),
		).toEqual([
			{ role: "assistant", content: "working" },
			{
				type: "function_call",
				call_id: "call_2",
				name: "reason",
				arguments: '{"input":"x"}',
			},
		]);
	});
});

describe("toResponseTools", () => {
	test("转换为 Responses 扁平 function tool", () => {
		expect(
			toResponseTools([
				{
					name: "observe",
					description: "Read data",
					parameters: {
						type: "object",
						properties: { path: { type: "string" } },
						required: ["path"],
						additionalProperties: false,
					},
				},
			]),
		).toEqual([
			{
				type: "function",
				name: "observe",
				description: "Read data",
				parameters: {
					type: "object",
					properties: { path: { type: "string" } },
					required: ["path"],
					additionalProperties: false,
				},
			},
		]);
	});
});
