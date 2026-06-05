/**
 * StreamAccumulator — 流式事件累积器
 *
 * 将 LLM 流式事件累积为完整的 AssistantMessage。
 * 纯数据累积，无 I/O、无框架依赖。
 *
 * 原位于 @n0n/types/client.ts，移到 @n0n/shared 以保持 types 包纯类型角色。
 */

import type {
	AssistantMessage,
	AssistantToolCallPart,
	StreamEvent,
	TokenUsage,
} from "@n0n/types";

export type { AssistantMessage, AssistantToolCallPart };

/** 累积流式事件为完整消息 */
export class StreamAccumulator {
	content = "";
	reasoning = "";
	reasoningSignature = "";
	toolCalls = new Map<
		number,
		{ toolCallId: string; toolName: string; input: string }
	>();
	finishReason: string | null = null;
	/** 本轮 LLM 调用的 token 用量 */
	usage: TokenUsage | null = null;

	push(event: StreamEvent): void {
		switch (event.type) {
			case "thinking":
				this.reasoning += event.text;
				break;
			case "thinking_signature":
				this.reasoningSignature = event.signature;
				break;
			case "content":
				this.content += event.text;
				break;
			case "tool_call_delta": {
				let tc = this.toolCalls.get(event.index);
				if (!tc) {
					tc = {
						toolCallId: event.id ?? "",
						toolName: event.name ?? "",
						input: "",
					};
					this.toolCalls.set(event.index, tc);
				}
				if (event.id) tc.toolCallId = event.id;
				if (event.name) tc.toolName = event.name;
				tc.input += event.arguments;
				break;
			}
			case "done":
				this.finishReason = event.finishReason;
				this.usage = event.usage;
				break;
			case "error":
				// error 事件不累积，由消费方直接处理
				break;
			default: {
				const _exhaustive: never = event;
				break;
			}
		}
	}

	toMessage(): AssistantMessage {
		return {
			role: "assistant",
			content: this.content || null,
			reasoningText: this.reasoning || null,
			reasoningSignature: this.reasoningSignature || undefined,
			toolCalls: [...this.toolCalls.values()],
		};
	}
}
