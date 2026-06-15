/**
 * PromptMessage → OpenAI Chat Completions 格式转换
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type { OpenAIMessage, OpenAIToolCall, OpenAIToolDef } from "./types.ts";

/** 将 PromptMessage 数组转换为 OpenAI API 消息格式 */
export function toOpenAIMessages(
	promptMessages: PromptMessage[],
): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

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
					const toolCalls: OpenAIToolCall[] = msg.toolCalls.map((tc) => ({
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
						tool_calls: toolCalls,
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
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

/** 将 ToolDefinition 数组转换为 OpenAI API 工具格式 */
export function toOpenAITools(tools: ToolDefinition[]): OpenAIToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}
