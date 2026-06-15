/**
 * PromptMessage → Gemini Message 格式转换
 */

import type { PromptMessage, StreamEvent, ToolDefinition } from "@n0n/types";
import { chunkToStreamEvents, type SSEChunk } from "../sse-utils.ts";
import type { GeminiMessage, GeminiToolCall, GeminiToolDef } from "./types.ts";

/** 将 PromptMessage 数组转换为 Gemini API 消息格式 */
export function toGeminiMessages(
	promptMessages: PromptMessage[],
): GeminiMessage[] {
	const result: GeminiMessage[] = [];

	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;

			case "user":
				result.push({ role: "user", content: msg.content });
				break;

			case "assistant": {
				if (msg.toolCalls?.length) {
					const toolCalls: GeminiToolCall[] = msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.tool,
							arguments: JSON.stringify(tc.args),
						},
					}));
					result.push({
						role: "assistant",
						content: msg.content || null,
						reasoning_content: msg.reasoning ?? undefined,
						tool_calls: toolCalls,
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
						reasoning_content: msg.reasoning ?? undefined,
					});
				}
				break;
			}

			case "tool":
				result.push({
					role: "tool",
					content: msg.content,
					tool_call_id: msg.toolCallId,
				});
				break;
		}
	}

	return result;
}

/** 将 ToolDefinition 数组转换为 Gemini API 工具格式 */
export function toGeminiTools(tools: ToolDefinition[]): GeminiToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

// ── Gemini 专用 SSE chunk 处理器 ──

/** Gemini 专用——在标准 chunk 处理基础上追加 thought_signatures */
export function* geminiChunkToStreamEvents(
	chunk: SSEChunk,
): Generator<StreamEvent> {
	yield* chunkToStreamEvents(chunk);
	const delta = chunk.choices?.[0]?.delta;
	if (delta?.provider_specific_fields?.thought_signatures?.length) {
		for (const sig of delta.provider_specific_fields.thought_signatures) {
			yield { type: "thinking_signature", signature: sig };
		}
	}
}
