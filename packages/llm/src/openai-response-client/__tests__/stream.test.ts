import { describe, expect, test } from "bun:test";
import type { StreamEvent } from "@n0n/types";
import { decodeResponseSignature } from "../signature.ts";
import { parseResponseStream } from "../stream.ts";

function sseStream(events: unknown[]): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	return new ReadableStream({
		start(controller) {
			for (const event of events) {
				controller.enqueue(
					encoder.encode(`event: ignored\ndata: ${JSON.stringify(event)}\n\n`),
				);
			}
			controller.close();
		},
	});
}

describe("parseResponseStream", () => {
	test("解析 summary、文本、工具调用、opaque output items 和 usage", async () => {
		const output = [
			{
				type: "reasoning",
				id: "rs_1",
				encrypted_content: "opaque",
				summary: [{ type: "summary_text", text: "Inspect first." }],
			},
			{
				type: "function_call",
				id: "fc_1",
				call_id: "call_1",
				name: "observe",
				arguments: '{"path":"README.md"}',
			},
		];
		const input = sseStream([
			{
				type: "response.output_item.added",
				output_index: 1,
				item: {
					type: "function_call",
					id: "fc_1",
					call_id: "call_1",
					name: "observe",
					arguments: "",
				},
			},
			{
				type: "response.reasoning_summary_text.delta",
				output_index: 0,
				delta: "Inspect first.",
			},
			{
				type: "response.function_call_arguments.delta",
				output_index: 1,
				delta: '{"path":',
			},
			{
				type: "response.function_call_arguments.delta",
				output_index: 1,
				delta: '"README.md"}',
			},
			{
				type: "response.output_item.done",
				output_index: 0,
				item: output[0],
			},
			{
				type: "response.output_item.done",
				output_index: 1,
				item: output[1],
			},
			{
				type: "response.completed",
				response: {
					status: "completed",
					output,
					usage: {
						input_tokens: 100,
						output_tokens: 20,
						total_tokens: 120,
						input_tokens_details: {
							cached_tokens: 40,
							cache_write_tokens: 10,
						},
					},
				},
			},
		]);

		const events: StreamEvent[] = [];
		for await (const event of parseResponseStream(input.getReader())) {
			events.push(event);
		}

		expect(events.slice(0, 4)).toEqual([
			{
				type: "tool_call_delta",
				index: 1,
				id: "call_1",
				name: "observe",
				arguments: "",
			},
			{ type: "thinking", text: "Inspect first.\n" },
			{
				type: "tool_call_delta",
				index: 1,
				id: "call_1",
				name: "observe",
				arguments: '{"path":',
			},
			{
				type: "tool_call_delta",
				index: 1,
				id: "call_1",
				name: "observe",
				arguments: '"README.md"}',
			},
		]);

		const signature = events.find(
			(event) => event.type === "thinking_signature",
		);
		expect(signature?.type).toBe("thinking_signature");
		if (signature?.type === "thinking_signature") {
			expect(decodeResponseSignature(signature.signature)).toEqual(output);
		}

		expect(events.at(-1)).toEqual({
			type: "done",
			finishReason: "tool_calls",
			usage: {
				inputTokens: 50,
				outputTokens: 20,
				totalTokens: 120,
				cacheReadTokens: 40,
				cacheWriteTokens: 10,
			},
		});
	});

	test("每个 reasoning summary chunk 后追加一个换行", async () => {
		const input = sseStream([
			{
				type: "response.reasoning_summary_text.delta",
				output_index: 0,
				delta: "**Inspecting files**",
			},
			{
				type: "response.reasoning_summary_text.delta",
				output_index: 0,
				delta: "**Checking tests**\n",
			},
			{
				type: "response.completed",
				response: { status: "completed", output: [] },
			},
		]);

		const events: StreamEvent[] = [];
		for await (const event of parseResponseStream(input.getReader())) {
			events.push(event);
		}
		expect(events).toEqual([
			{ type: "thinking", text: "**Inspecting files**\n" },
			{ type: "thinking", text: "**Checking tests**\n" },
			{ type: "done", finishReason: "stop", usage: null },
		]);
	});

	test("将 incomplete 映射为 length", async () => {
		const input = sseStream([
			{
				type: "response.incomplete",
				response: {
					status: "incomplete",
					incomplete_details: { reason: "max_output_tokens" },
					output: [],
				},
			},
		]);

		const events: StreamEvent[] = [];
		for await (const event of parseResponseStream(input.getReader())) {
			events.push(event);
		}
		expect(events).toEqual([
			{ type: "done", finishReason: "length", usage: null },
		]);
	});
});
