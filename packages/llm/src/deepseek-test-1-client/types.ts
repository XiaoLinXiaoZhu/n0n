/**
 * deepseek-test-1 API 类型定义 — OpenAI Chat Completions 兼容协议
 */

export interface DSMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: DSToolCall[];
	tool_call_id?: string;
}

export interface DSToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface DSToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface DSRequest {
	model: string;
	messages: DSMessage[];
	tools?: DSToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	reasoning_effort?: "high" | "max";
	/** extra_body 透传字段 — 由 Object.assign 合并，可覆盖以上任意字段 */
	[key: string]: unknown;
}
