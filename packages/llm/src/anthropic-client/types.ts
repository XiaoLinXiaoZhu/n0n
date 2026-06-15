/**
 * Anthropic API 类型定义 — SSE 事件类型 + 请求/响应类型
 *
 * 所有 Anthropic Messages API 协议相关的类型集中在此，
 * 供 format.ts 和 anthropic-client.ts 共用。
 */

// ── Anthropic API Types ──

export type AnthropicContent =
	| { type: "text"; text: string; cache_control?: { type: "ephemeral" } }
	| { type: "thinking"; thinking: string; signature?: string }
	| {
			type: "tool_use";
			id: string;
			name: string;
			input: Record<string, unknown>;
			cache_control?: { type: "ephemeral" };
	  }
	| {
			type: "tool_result";
			tool_use_id: string;
			content: string;
			cache_control?: { type: "ephemeral" };
	  };

export interface AnthropicMessage {
	role: "user" | "assistant";
	content: string | AnthropicContent[];
}

export interface AnthropicTool {
	name: string;
	description: string;
	input_schema: Record<string, unknown>;
	/** 启用细粒度工具流式传输 — 跳过服务端 JSON 缓冲验证，直接流式发送参数 */
	eager_input_streaming?: boolean;
}

export interface AnthropicRequest {
	model: string;
	max_tokens: number;
	system?:
		| string
		| Array<{
				type: "text";
				text: string;
				cache_control?: { type: "ephemeral" };
		  }>;
	messages: AnthropicMessage[];
	tools?: AnthropicTool[];
	tool_choice?: { type: "auto" | "none" | "any" };
	stream?: boolean;
	thinking?: { type: "enabled"; budget_tokens: number };
	temperature?: number;
}

// ── SSE Event Types ──

export interface ContentBlockStart {
	type: "content_block_start";
	index: number;
	content_block:
		| { type: "text"; text: string }
		| { type: "thinking"; thinking: string }
		| {
				type: "tool_use";
				id: string;
				name: string;
				input: Record<string, unknown>;
		  };
}

export interface ContentBlockDelta {
	type: "content_block_delta";
	index: number;
	delta:
		| { type: "text_delta"; text: string }
		| { type: "thinking_delta"; thinking: string }
		| { type: "input_json_delta"; partial_json: string }
		| { type: "signature_delta"; signature: string };
}

export interface MessageDelta {
	type: "message_delta";
	delta: {
		stop_reason: string | null;
	};
	usage?: {
		output_tokens?: number;
	};
}

export interface MessageStart {
	type: "message_start";
	message?: {
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		};
	};
}

export type AnthropicSSEEvent =
	| ContentBlockStart
	| ContentBlockDelta
	| MessageDelta
	| MessageStart
	| { type: "content_block_stop"; index: number }
	| { type: "message_stop" }
	| { type: "ping" }
	| { type: "error"; error: { type: string; message: string } };
