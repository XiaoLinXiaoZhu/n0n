/**
 * OpenAI Responses API 的最小协议类型。
 *
 * output item 会被原样放入 reasoningSignature，以支持 store=false 的
 * 无状态续轮。这里只约束项目需要读取的字段，其余字段保持开放。
 */

export type ResponseInputItem =
	| { role: "system" | "user" | "assistant"; content: string }
	| {
			type: "function_call";
			call_id: string;
			name: string;
			arguments: string;
			[key: string]: unknown;
	  }
	| {
			type: "function_call_output";
			call_id: string;
			output: string;
	  }
	| ResponseOutputItem;

export interface ResponseOutputItem {
	type: string;
	[key: string]: unknown;
}

export interface ResponseFunctionCallItem extends ResponseOutputItem {
	type: "function_call";
	call_id: string;
	name: string;
	arguments: string;
}

export interface ResponseTool {
	type: "function";
	name: string;
	description: string;
	parameters: Record<string, unknown>;
}

export interface OpenAIResponseRequest {
	model: string;
	input: ResponseInputItem[];
	store: false;
	include: string[];
	stream?: boolean;
	tools?: ResponseTool[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	[key: string]: unknown;
}

export interface OpenAIResponseBody {
	output?: ResponseOutputItem[];
	output_text?: string;
	usage?: ResponseUsage;
	status?: string;
	incomplete_details?: { reason?: string | null } | null;
	error?: { message?: string; code?: string | null } | null;
}

export interface ResponseUsage {
	input_tokens?: number;
	output_tokens?: number;
	total_tokens?: number;
	input_tokens_details?: {
		cached_tokens?: number;
		cache_write_tokens?: number;
	};
}

export type OpenAIResponseSSEEvent =
	| {
			type: "response.output_item.added";
			output_index: number;
			item: ResponseOutputItem;
	  }
	| {
			type: "response.output_item.done";
			output_index: number;
			item: ResponseOutputItem;
	  }
	| {
			type: "response.output_text.delta";
			output_index: number;
			delta: string;
	  }
	| {
			type: "response.refusal.delta";
			output_index: number;
			delta: string;
	  }
	| {
			type: "response.reasoning_summary_text.delta";
			output_index: number;
			delta: string;
	  }
	| {
			type: "response.function_call_arguments.delta";
			output_index: number;
			delta: string;
	  }
	| {
			type: "response.completed" | "response.incomplete";
			response: OpenAIResponseBody;
	  }
	| {
			type: "response.failed";
			response: OpenAIResponseBody;
	  }
	| {
			type: "error";
			message?: string;
			code?: string | null;
	  };
