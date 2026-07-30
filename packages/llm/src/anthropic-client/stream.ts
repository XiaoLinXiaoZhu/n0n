/**
 * Anthropic Client — stream() 方法
 *
 * SSE 事件映射：
 * - content_block_start(type=text) + content_block_delta(text_delta) → StreamEvent.content
 * - content_block_start(type=thinking) + content_block_delta(thinking_delta) → StreamEvent.thinking
 * - content_block_start(type=tool_use) + content_block_delta(input_json_delta) → StreamEvent.tool_call_delta
 * - message_delta(stop_reason) → StreamEvent.done
 *
 * thinking / output_config 等厂商特定参数通过 extra_body 透传。
 */

import {
	FinishReason,
	type StreamEvent,
	type StreamRequest,
	type TokenUsage,
} from "@n0n/types";
import type { AnthropicProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { DEFAULT_STREAM_MAX_TOKENS } from "./constants.ts";
import { toAnthropicFormat, toAnthropicTools } from "./format.ts";
import type {
	AnthropicRequest,
	AnthropicSSEEvent,
	MessageDelta,
} from "./types.ts";
import { AnthropicSSEEventSchema } from "./types.ts";

/** AnthropicClient 暴露给 stream 方法的内部状态 */
export interface AnthropicStreamContext {
	modelId: string;
	apiUrl: string | URL;
	format: FormatFn;
	pc: AnthropicProviderConfig;
}

export async function* anthropicStream(
	ctx: AnthropicStreamContext,
	request: StreamRequest,
	signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
	const promptMessages = ctx.format(request.messages);
	const { system, messages } = toAnthropicFormat(promptMessages);

	// 过滤空消息——防止提取后残留的空 user 或只有 thinking 无内容的 assistant
	const filteredMessages = messages.filter((msg) => {
		if (msg.role === "user") {
			if (typeof msg.content === "string" && !msg.content.trim()) return false;
			if (Array.isArray(msg.content) && msg.content.length === 0) return false;
		}
		if (msg.role === "assistant") {
			if (Array.isArray(msg.content) && msg.content.length === 0) return false;
			if (typeof msg.content === "string" && !msg.content.trim()) return false;
		}
		return true;
	});

	const body: AnthropicRequest = {
		model: ctx.modelId,
		max_tokens: DEFAULT_STREAM_MAX_TOKENS,
		system,
		messages: filteredMessages,
		stream: true,
	};

	if (request.tools?.length) {
		body.tools = toAnthropicTools(request.tools);
		const tc = request.toolChoice ?? "auto";
		body.tool_choice = { type: tc === "required" ? "any" : tc };
	}

	// extra_body 透传 — 可覆盖以上任意字段（含 thinking、output_config、max_tokens 等）
	if (ctx.pc.extra_body) {
		Object.assign(body, ctx.pc.extra_body);
	}

	let res: Response;
	try {
		res = await fetch(ctx.apiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"x-api-key": ctx.pc.api_key,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify(body),
			signal,
		});
	} catch (err) {
		if (isAbortError(err)) return;
		yield {
			type: "error",
			error: err instanceof Error ? err.message : String(err),
		};
		return;
	}

	if (!res.ok) {
		const text = await res.text();
		yield { type: "error", error: `Anthropic API ${res.status}: ${text}` };
		return;
	}

	if (!res.body) {
		yield {
			type: "error",
			error: "Anthropic streaming response has no body",
		};
		return;
	}

	// Track tool_use blocks by SSE index → sequential tool call index
	const toolBlocks = new Map<
		number,
		{ id: string; name: string; idx: number }
	>();
	let toolCallIndex = 0;
	let inputUsage: TokenUsage | null = null;

	// 内部函数：将 Anthropic stop_reason 映射为归一化的 done 事件
	const mapMessageDelta = function* (
		event: MessageDelta,
	): Generator<StreamEvent> {
		const stopReason = event.delta.stop_reason ?? "stop";
		const outputTokens = event.usage?.output_tokens ?? 0;
		const usage: TokenUsage | null = inputUsage
			? {
					...inputUsage,
					outputTokens: inputUsage.outputTokens + outputTokens,
					totalTokens:
						inputUsage.inputTokens + inputUsage.outputTokens + outputTokens,
				}
			: null;
		yield {
			type: "done",
			finishReason:
				stopReason === "end_turn"
					? FinishReason.STOP
					: stopReason === "max_tokens"
						? FinishReason.LENGTH
						: stopReason === "tool_use"
							? FinishReason.TOOL_CALLS
							: stopReason,
			usage,
		};
	};

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			let boundary = buffer.indexOf("\n\n");
			while (boundary !== -1) {
				const raw = buffer.slice(0, boundary);
				buffer = buffer.slice(boundary + 2);

				// Parse SSE event
				let eventData = "";
				for (const line of raw.split("\n")) {
					if (line.startsWith("data: ")) {
						eventData = line.slice(6);
					}
				}

				if (!eventData) {
					boundary = buffer.indexOf("\n\n");
					continue;
				}

				let event: AnthropicSSEEvent;
				try {
					event = AnthropicSSEEventSchema.parse(JSON.parse(eventData));
				} catch {
					boundary = buffer.indexOf("\n\n");
					continue;
				}

				switch (event.type) {
					case "message_start": {
						const u = event.message?.usage;
						if (u) {
							inputUsage = {
								inputTokens: u.input_tokens ?? 0,
								outputTokens: u.output_tokens ?? 0,
								totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
								cacheReadTokens: u.cache_read_input_tokens ?? 0,
								cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
							};
						}
						break;
					}

					case "content_block_start": {
						const block = event.content_block;
						if (block.type === "text" && block.text) {
							yield { type: "content", text: block.text };
						} else if (block.type === "thinking" && block.thinking) {
							yield { type: "thinking", text: block.thinking };
						} else if (block.type === "tool_use") {
							const idx = toolCallIndex++;
							toolBlocks.set(event.index, {
								id: block.id,
								name: block.name,
								idx,
							});
							yield {
								type: "tool_call_delta",
								index: idx,
								id: block.id,
								name: block.name,
								arguments: "",
							};
						}
						break;
					}

					case "content_block_delta": {
						const delta = event.delta;
						if (delta.type === "text_delta") {
							yield { type: "content", text: delta.text };
						} else if (delta.type === "thinking_delta") {
							yield { type: "thinking", text: delta.thinking };
						} else if (delta.type === "input_json_delta") {
							const tb = toolBlocks.get(event.index);
							yield {
								type: "tool_call_delta",
								index: tb?.idx ?? event.index,
								id: tb?.id,
								name: undefined,
								arguments: delta.partial_json,
							};
						} else if (delta.type === "signature_delta") {
							yield {
								type: "thinking_signature",
								signature: delta.signature,
							};
						}
						break;
					}

					case "message_delta":
						yield* mapMessageDelta(event);
						break;

					case "error":
						yield {
							type: "error",
							error: `Anthropic error: ${event.error.type}: ${event.error.message}`,
						};
						break;
				}

				boundary = buffer.indexOf("\n\n");
			}
		}

		// Flush remaining buffer — handle case where stream ends without trailing \n\n
		if (buffer.trim()) {
			let eventData = "";
			for (const line of buffer.split("\n")) {
				if (line.startsWith("data: ")) {
					eventData = line.slice(6);
				}
			}
			if (eventData) {
				try {
					const event = AnthropicSSEEventSchema.parse(JSON.parse(eventData));
					if (event.type === "message_delta") {
						yield* mapMessageDelta(event);
					}
				} catch {
					// ignore parse errors in residual buffer
				}
			}
		}
	} catch (err) {
		if (!isAbortError(err)) {
			yield {
				type: "error",
				error: err instanceof Error ? err.message : String(err),
			};
		}
	} finally {
		reader.releaseLock();
	}
}
