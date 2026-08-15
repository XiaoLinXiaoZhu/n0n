/**
 * PromptMessage → DeepSeek API Message 格式转换
 *
 * reasoning_content 始终保留（当存在时），不再由 enable_thinking 开关控制。
 * assistant 的 reasoning 写出前经过文段改写（"Let me" → "We need to" 等）。
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type {
	DeepSeekMessage,
	DeepSeekToolCall,
	DeepSeekToolDef,
} from "./types.ts";
import { rewriteParagraphs } from "./utils.ts";

/** 将 PromptMessage 数组转换为 DeepSeek API 消息格式 */
export function toDeepSeekMessages(
	promptMessages: PromptMessage[],
): DeepSeekMessage[] {
	const result: DeepSeekMessage[] = [];

	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;

			case "user":
				result.push({ role: "user", content: msg.content });
				break;

			case "assistant": {
				const reasoningContent = msg.reasoning
					? { reasoning_content: rewriteParagraphs(msg.reasoning) }
					: {};
				if (msg.toolCalls?.length) {
					const toolCalls: DeepSeekToolCall[] = msg.toolCalls.map((tc) => ({
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
						...reasoningContent,
						tool_calls: toolCalls,
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
						...reasoningContent,
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

/** 将 ToolDefinition 数组转换为 DeepSeek API 工具格式 */
export function toDeepSeekTools(tools: ToolDefinition[]): DeepSeekToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}
