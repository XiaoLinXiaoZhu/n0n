/**
 * PromptMessage → DeepSeek API Message 格式转换
 *
 * system 消息由 systemPromptAdapter 单独处理，此处跳过。
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type {
	DeepSeekMessage,
	DeepSeekToolCall,
	DeepSeekToolDef,
} from "./types.ts";

/** 将 PromptMessage 数组转换为 DeepSeek API 消息格式（跳过 system） */
export function toDeepSeekMessages(
	promptMessages: PromptMessage[],
	enableThinking?: boolean,
): DeepSeekMessage[] {
	const result: DeepSeekMessage[] = [];

	for (const msg of promptMessages) {
		if (msg.role === "system") continue;

		switch (msg.role) {
			case "user":
				result.push({ role: "user", content: msg.content });
				break;

			case "assistant": {
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
						...(enableThinking
							? { reasoning_content: msg.reasoning ?? "" }
							: {}),
						tool_calls: toolCalls,
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
						...(enableThinking
							? { reasoning_content: msg.reasoning ?? "" }
							: {}),
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
