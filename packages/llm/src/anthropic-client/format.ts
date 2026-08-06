/**
 * PromptMessage → Anthropic Message 格式转换
 *
 * 纯函数集合：将领域 PromptMessage 转换为 Anthropic Messages API 格式。
 * 处理 system 消息拆离、cache_control 断点注入、工具定义转换。
 */

import type { PromptMessage, ToolDefinition } from "@n0n/types";
import type {
	AnthropicContent,
	AnthropicMessage,
	AnthropicTool,
} from "./types.ts";

// ── 转换结果类型 ──

export interface AnthropicConversionResult {
	system:
		| string
		| Array<{
				type: "text";
				text: string;
				cache_control?: { type: "ephemeral" };
		  }>
		| undefined;
	messages: AnthropicMessage[];
}

function hasAnthropicContent(content: AnthropicMessage["content"]): boolean {
	if (typeof content === "string") return content.trim().length > 0;

	return content.some((block) => {
		switch (block.type) {
			case "text":
				return block.text.trim().length > 0;
			case "thinking":
				// 空 thinking 文本仍可通过 signature 还原原始思考。
				return Boolean(block.signature);
			case "tool_use":
			case "tool_result":
				return true;
			default: {
				const _exhaustive: never = block;
				return _exhaustive;
			}
		}
	});
}

// ── PromptMessage → Anthropic Message 转换 ──

export function toAnthropicFormat(
	promptMessages: PromptMessage[],
): AnthropicConversionResult {
	const systemParts: Array<{
		type: "text";
		text: string;
		cache_control?: { type: "ephemeral" };
	}> = [];
	const messages: AnthropicMessage[] = [];

	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system": {
				const part: (typeof systemParts)[number] = {
					type: "text",
					text: msg.content,
				};
				if (msg.cacheBreakpoint) {
					part.cache_control = { type: "ephemeral" };
				}
				systemParts.push(part);
				break;
			}

			case "user":
				if (msg.cacheBreakpoint) {
					messages.push({
						role: "user",
						content: [
							{
								type: "text",
								text: msg.content,
								cache_control: { type: "ephemeral" },
							},
						],
					});
				} else {
					messages.push({
						role: "user",
						content: msg.content,
					});
				}
				break;

			case "assistant": {
				// Anthropic 的 thinking 文本只是展示用的摘要，只有 signature
				// 才能在下一轮请求中还原原始思考。中断时可能只留下
				// reasoning/content，却没有 signature；这条 assistant 消息
				// 不能安全地回传，直接丢弃。
				if (msg.reasoning !== undefined && !msg.reasoningSignature) {
					continue;
				}

				const content: AnthropicContent[] = [];
				// 只要有 signature 就回传 thinking block（reasoning 可能因 display 设置而为空）
				// Anthropic 要求 thinking block 完整回传，含空 thinking 文本和 signature
				if (msg.reasoningSignature) {
					content.push({
						type: "thinking",
						thinking: msg.reasoning ?? "",
						signature: msg.reasoningSignature,
					});
				}
				if (msg.content) {
					content.push({ type: "text", text: msg.content });
				}
				if (msg.toolCalls?.length) {
					for (const tc of msg.toolCalls) {
						content.push({
							type: "tool_use",
							id: tc.id,
							name: tc.tool,
							input: tc.args,
						});
					}
				}
				// 不构造空文本块。没有文本、thinking 或工具调用的 assistant
				// 消息不应发送给 Anthropic。
				if (content.length === 0) continue;
				if (msg.cacheBreakpoint) {
					for (let i = content.length - 1; i >= 0; i--) {
						const block = content[i];
						if (
							block &&
							(block.type === "text" ||
								block.type === "tool_result" ||
								block.type === "tool_use")
						) {
							block.cache_control = { type: "ephemeral" };
							break;
						}
					}
				}
				messages.push({ role: "assistant", content });
				break;
			}

			case "tool": {
				const toolResultBlock: AnthropicContent = {
					type: "tool_result",
					tool_use_id: msg.toolCallId,
					content: msg.content,
				};
				if (msg.cacheBreakpoint) {
					toolResultBlock.cache_control = { type: "ephemeral" };
				}
				messages.push({
					role: "user",
					content: [toolResultBlock],
				});
				break;
			}
		}
	}

	// Anthropic 不接受没有实际内容的消息。这里同时覆盖 heartbeat
	// 和 streaming 两条调用路径，避免仅由空字符串组成的 user 消息。
	const nonEmptyMessages = messages.filter((msg) =>
		hasAnthropicContent(msg.content),
	);
	messages.length = 0;
	messages.push(...nonEmptyMessages);

	// 自动 cache breakpoint：在最后一条可缓存的消息末尾注入 cache_control
	let autoBreakpointSet = false;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg) continue;

		if (typeof msg.content === "string") {
			msg.content = [
				{
					type: "text",
					text: msg.content,
					cache_control: { type: "ephemeral" },
				},
			];
			autoBreakpointSet = true;
			break;
		}

		if (Array.isArray(msg.content) && msg.content.length > 0) {
			for (let j = msg.content.length - 1; j >= 0; j--) {
				const block = msg.content[j];
				if (
					block &&
					(block.type === "text" ||
						block.type === "tool_result" ||
						block.type === "tool_use")
				) {
					block.cache_control = { type: "ephemeral" };
					autoBreakpointSet = true;
					break;
				}
			}
			if (autoBreakpointSet) break;
		}
	}

	if (!autoBreakpointSet && messages.length === 0 && systemParts.length > 0) {
		for (let i = systemParts.length - 1; i >= 0; i--) {
			const part = systemParts[i];
			if (part) {
				part.cache_control = { type: "ephemeral" };
				break;
			}
		}
	}

	// 有 cache_control 标记时必须使用数组形式（字符串形式不支持 cache_control）
	const hasSystemBreakpoint = systemParts.some((p) => p.cache_control);
	const system =
		systemParts.length === 0
			? undefined
			: systemParts.length === 1 && !hasSystemBreakpoint
				? systemParts[0]?.text
				: systemParts;

	return { system, messages };
}

// ── ToolDefinition → AnthropicTool 转换 ──

export function toAnthropicTools(tools: ToolDefinition[]): AnthropicTool[] {
	return tools.map((t) => ({
		name: t.name,
		description: t.description,
		input_schema: t.parameters,
		// Anthropic 默认会缓冲工具参数 JSON 直到验证完整后才发送 SSE 事件，
		// 导致长参数（如 write 的 content）出现 10s+ 的等待后一次性涌出。
		// 启用 eager_input_streaming 跳过服务端缓冲，实现真正的逐 token 流式传输。
		eager_input_streaming: true,
	}));
}
