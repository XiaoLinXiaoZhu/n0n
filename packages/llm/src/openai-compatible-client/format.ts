/**
 * PromptMessage → OpenAI Chat Completions 格式转换（compatible 变体）
 *
 * 与 openai-client/format.ts 的区别：
 * - 支持 enable_thinking（reasoning_content 回传）
 * - 支持 backend_provider（anthropic backend 时注入 cache_control）
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type { OpenAIMessage, OpenAIToolCall, OpenAIToolDef } from "./types.ts";

export function toOpenAIMessages(
	promptMessages: PromptMessage[],
	enableThinking: boolean,
	backendProvider: string | undefined,
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

		// Anthropic via litellm: 在最近一条消息上注入 cache_control 断点
		if (
			backendProvider === "anthropic" &&
			msg.cacheBreakpoint &&
			result[result.length - 1]
		) {
			(result[result.length - 1] as OpenAIMessage).cache_control = {
				type: "ephemeral",
			};
		}
	}

	// litellm + anthropic backend：末尾自动添加缓存标记，配合显式断点实现双重缓存
	if (backendProvider === "anthropic") {
		const last = result[result.length - 1];
		if (last) {
			last.cache_control = { type: "ephemeral" };
		}
	}

	return result;
}

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
