/**
 * OpenAI Compatible API 类型定义 — Chat Completions 协议
 */

export interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
	/** Anthropic backend via litellm: 注入 cache_control 断点 */
	cache_control?: { type: "ephemeral" };
}

export interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface OpenAIToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface OpenAIRequest {
	model: string;
	messages: OpenAIMessage[];
	tools?: OpenAIToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	/** extra_body 透传字段 — 由 Object.assign 合并，可覆盖以上任意字段 */
	[key: string]: unknown;
}
