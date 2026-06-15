/**
 * PromptMessage → deepseek-test-1 API Message 格式转换
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type { DSMessage, DSToolDef } from "./types.ts";

/** 将 PromptMessage 数组转换为 API 消息格式 */
export function toApiMessages(
	promptMessages: PromptMessage[],
	enableThinking?: boolean,
	memoryTag?: boolean,
): DSMessage[] {
	const result: DSMessage[] = [];
	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;
			case "user":
				result.push({ role: "user", content: msg.content });
				break;
			case "assistant": {
				const content =
					memoryTag && msg.content
						? `<memory>\n${msg.content}\n</memory>`
						: (msg.content ?? null);
				const reasoningContent =
					memoryTag && msg.reasoning
						? `<memory>\n${msg.reasoning}\n</memory>`
						: enableThinking
							? (msg.reasoning ?? "")
							: undefined;
				const base: DSMessage = {
					role: "assistant",
					content,
					...(reasoningContent !== undefined
						? { reasoning_content: reasoningContent }
						: {}),
				};
				if (msg.toolCalls?.length) {
					base.tool_calls = msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
					}));
				}
				result.push(base);
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

/** 将 ToolDefinition 数组转换为 API 工具格式 */
export function toApiTools(tools: ToolDefinition[]): DSToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}
