import { describe, expect, test } from "bun:test";
import {
	decodeResponseSignature,
	encodeResponseSignature,
} from "../signature.ts";

describe("OpenAI Responses reasoningSignature", () => {
	test("往返保存 output items", () => {
		const outputItems = [
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
		];

		expect(
			decodeResponseSignature(encodeResponseSignature(outputItems)),
		).toEqual(outputItems);
	});

	test("忽略其他 provider 或损坏的签名", () => {
		expect(decodeResponseSignature("anthropic-signature")).toBeUndefined();
		expect(
			decodeResponseSignature("openai-response:v1:not-json"),
		).toBeUndefined();
		expect(
			decodeResponseSignature(
				'openai-response:v1:{"version":1,"outputItems":[{}]}',
			),
		).toBeUndefined();
	});
});
