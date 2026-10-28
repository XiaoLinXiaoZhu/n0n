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
							tool: "post",
							args: { uri: "write://README.md", body: "" },
						},
					],
				},
				{
					role: "tool",
					toolCallId: "call_1",
					toolName: "post",
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
				name: "post",
				arguments: '{"uri":"write://README.md","body":""}',
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
					toolCalls: [
						{
							id: "call_2",
							tool: "post",
							args: { uri: "customer://question", body: "x" },
						},
					],
				},
			]),
		).toEqual([
			{ role: "assistant", content: "working" },
			{
				type: "function_call",
				call_id: "call_2",
				name: "post",
				arguments: '{"uri":"customer://question","body":"x"}',
			},
		]);
	});
});

describe("toResponseTools", () => {
	test("转换为 Responses 扁平 function tool", () => {
		expect(
			toResponseTools([
				{
					name: "post",
					description: "Post to a target via uri",
					parameters: {
						type: "object",
						properties: { uri: { type: "string" }, body: { type: "string" } },
						required: ["uri", "body"],
						additionalProperties: false,
					},
				},
			]),
		).toEqual([
			{
				type: "function",
				name: "post",
				description: "Post to a target via uri",
				parameters: {
					type: "object",
					properties: { uri: { type: "string" }, body: { type: "string" } },
					required: ["uri", "body"],
					additionalProperties: false,
				},
			},
		]);
	});
});
