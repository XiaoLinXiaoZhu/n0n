/**
 * Gemini API 类型定义 — OpenAI Chat Completions 兼容协议
 */

export interface GeminiMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: GeminiToolCall[];
	tool_call_id?: string;
}

export interface GeminiToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

export interface GeminiToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

export interface GeminiRequest {
	model: string;
	messages: GeminiMessage[];
	tools?: GeminiToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	reasoning_effort?: "low" | "medium" | "high";
}
