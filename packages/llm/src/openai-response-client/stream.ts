import { FinishReason, type StreamEvent, type TokenUsage } from "@n0n/types";
import { isAbortError } from "../errors.ts";
import { encodeResponseSignature } from "./signature.ts";
import type {
	OpenAIResponseBody,
	OpenAIResponseSSEEvent,
	ResponseFunctionCallItem,
	ResponseOutputItem,
	ResponseUsage,
} from "./types.ts";

interface StreamState {
	outputItems: Map<number, ResponseOutputItem>;
	functionCalls: Map<
		number,
		{ callId: string; name: string; argumentsSeen: boolean }
	>;
}

function* parseSegment(
	segment: string,
	state: StreamState,
): Generator<StreamEvent> {
	for (const line of segment.split("\n")) {
		if (!line.startsWith("data: ")) continue;
		const payload = line.slice(6);
		if (!payload || payload === "[DONE]") continue;
		try {
			const event = JSON.parse(payload) as OpenAIResponseSSEEvent;
			yield* handleEvent(event, state);
		} catch {
			// 忽略单个损坏事件，后续 response.failed/completed 仍可收束。
		}
	}
}

function tokenUsage(usage: ResponseUsage | undefined): TokenUsage | null {
	if (!usage) return null;
	const cacheReadTokens = usage.input_tokens_details?.cached_tokens ?? 0;
	const cacheWriteTokens = usage.input_tokens_details?.cache_write_tokens ?? 0;
	const rawInput = usage.input_tokens ?? 0;
	return {
		inputTokens: Math.max(0, rawInput - cacheReadTokens - cacheWriteTokens),
		outputTokens: usage.output_tokens ?? 0,
		totalTokens: usage.total_tokens ?? rawInput + (usage.output_tokens ?? 0),
		cacheReadTokens,
		cacheWriteTokens,
	};
}

function orderedOutputItems(
	state: StreamState,
	fallback: ResponseOutputItem[] | undefined,
): ResponseOutputItem[] {
	if (fallback?.length) return fallback;
	return [...state.outputItems.entries()]
		.sort(([a], [b]) => a - b)
		.map(([, item]) => item);
}

function responseError(response: OpenAIResponseBody): string {
	return (
		response.error?.message ??
		response.incomplete_details?.reason ??
		"OpenAI Responses API request failed"
	);
}

function* handleEvent(
	event: OpenAIResponseSSEEvent,
	state: StreamState,
): Generator<StreamEvent> {
	switch (event.type) {
		case "response.output_item.added": {
			if (event.item.type !== "function_call") return;
			const item = event.item as ResponseFunctionCallItem;
			state.functionCalls.set(event.output_index, {
				callId: item.call_id,
				name: item.name,
				argumentsSeen: false,
			});
			yield {
				type: "tool_call_delta",
				index: event.output_index,
				id: item.call_id,
				name: item.name,
				arguments: "",
			};
			return;
		}

		case "response.output_item.done": {
			state.outputItems.set(event.output_index, event.item);
			if (event.item.type !== "function_call") return;
			const item = event.item as ResponseFunctionCallItem;
			const tracked = state.functionCalls.get(event.output_index);
			if (!tracked) {
				yield {
					type: "tool_call_delta",
					index: event.output_index,
					id: item.call_id,
					name: item.name,
					arguments: item.arguments,
				};
			} else if (!tracked.argumentsSeen && item.arguments) {
				yield {
					type: "tool_call_delta",
					index: event.output_index,
					id: item.call_id,
					name: item.name,
					arguments: item.arguments,
				};
			}
			return;
		}

		case "response.output_text.delta":
		case "response.refusal.delta":
			yield { type: "content", text: event.delta };
			return;

		case "response.reasoning_summary_text.delta":
			yield {
				type: "thinking",
				text: event.delta.endsWith("\n") ? event.delta : `${event.delta}\n`,
			};
			return;

		case "response.function_call_arguments.delta": {
			const tracked = state.functionCalls.get(event.output_index);
			if (tracked) tracked.argumentsSeen = true;
			yield {
				type: "tool_call_delta",
				index: event.output_index,
				id: tracked?.callId,
				name: tracked?.name,
				arguments: event.delta,
			};
			return;
		}

		case "response.completed":
		case "response.incomplete": {
			const outputItems = orderedOutputItems(state, event.response.output);
			if (outputItems.length) {
				yield {
					type: "thinking_signature",
					signature: encodeResponseSignature(outputItems),
				};
			}
			const hasToolCalls = outputItems.some(
				(item) => item.type === "function_call",
			);
			yield {
				type: "done",
				finishReason:
					event.type === "response.incomplete"
						? event.response.incomplete_details?.reason === "content_filter"
							? FinishReason.CONTENT_FILTER
							: FinishReason.LENGTH
						: hasToolCalls
							? FinishReason.TOOL_CALLS
							: FinishReason.STOP,
				usage: tokenUsage(event.response.usage),
			};
			return;
		}

		case "response.failed":
			yield { type: "error", error: responseError(event.response) };
			return;

		case "error":
			yield {
				type: "error",
				error: event.message ?? event.code ?? "OpenAI Responses API error",
			};
			return;
	}
}

/** 解析 OpenAI Responses API SSE 流。 */
export async function* parseResponseStream(reader: {
	read(): Promise<{ done: boolean; value?: Uint8Array }>;
	releaseLock(): void;
}): AsyncGenerator<StreamEvent> {
	const decoder = new TextDecoder();
	const state: StreamState = {
		outputItems: new Map(),
		functionCalls: new Map(),
	};
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });

			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const segment = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);
				yield* parseSegment(segment, state);
				boundary = buffer.indexOf("\n\n");
			}
		}
		if (buffer.trim()) yield* parseSegment(buffer, state);
	} catch (error) {
		if (!isAbortError(error)) {
			yield {
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	} finally {
		reader.releaseLock();
	}
}
