/**
 * Anthropic API 类型定义 — SSE 事件类型 + 请求/响应类型
 *
 * 所有 Anthropic Messages API 协议相关的类型集中在此，
 * 供 format.ts 和 anthropic-client.ts 共用。
 *
 * thinking / output_config 等厂商特定参数通过 extra_body 透传，
 * 不在请求类型中固化。
 */

import { z } from "zod";

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

/** Anthropic Messages API 请求体 — 最小字段集，其余通过 extra_body 透传 */
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

// ── Zod Schemas（parse 替代 as 断言）──

const _contentBlockSchema = z.union([
	z.object({ type: z.literal("text"), text: z.string() }),
	z.object({ type: z.literal("thinking"), thinking: z.string() }),
	z.object({
		type: z.literal("tool_use"),
		id: z.string(),
		name: z.string(),
		input: z.record(z.string(), z.unknown()),
	}),
]);

const _deltaSchema = z.union([
	z.object({ type: z.literal("text_delta"), text: z.string() }),
	z.object({ type: z.literal("thinking_delta"), thinking: z.string() }),
	z.object({ type: z.literal("input_json_delta"), partial_json: z.string() }),
	z.object({ type: z.literal("signature_delta"), signature: z.string() }),
]);

export const AnthropicSSEEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("content_block_start"),
		index: z.number(),
		content_block: _contentBlockSchema,
	}),
	z.object({
		type: z.literal("content_block_delta"),
		index: z.number(),
		delta: _deltaSchema,
	}),
	z.object({
		type: z.literal("message_delta"),
		delta: z.object({ stop_reason: z.string().nullable() }),
		usage: z.object({ output_tokens: z.number().optional() }).optional(),
	}),
	z.object({
		type: z.literal("message_start"),
		message: z
			.object({
				usage: z
					.object({
						input_tokens: z.number().optional(),
						output_tokens: z.number().optional(),
						cache_creation_input_tokens: z.number().optional(),
						cache_read_input_tokens: z.number().optional(),
					})
					.optional(),
			})
			.optional(),
	}),
	z.object({ type: z.literal("content_block_stop"), index: z.number() }),
	z.object({ type: z.literal("message_stop") }),
	z.object({ type: z.literal("ping") }),
	z.object({
		type: z.literal("error"),
		error: z.object({ type: z.string(), message: z.string() }),
	}),
]);
