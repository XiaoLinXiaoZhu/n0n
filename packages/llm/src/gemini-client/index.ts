/**
 * Gemini Client — Google Gemini 模型通过 OpenAI Chat Completions 兼容协议实现
 *
 * 实现 LLMClient 接口，通过原生 fetch + SSE 解析与 Gemini 兼容网关通信。
 * Gemini 的 OpenAI 兼容端点遵循标准 Chat Completions 协议：
 * - 请求格式同 OpenAI（messages + tools + stream）
 * - SSE 响应格式同 OpenAI（data: JSON chunks）
 * - 支持 function calling（tool_calls）
 *
 * Thinking 模式：
 * - 请求：注入 `reasoning_effort`（low/medium/high），思考内容通过 `delta.reasoning_content` 独立传输
 * - 响应：思考内容通过 `delta.reasoning_content` 流式传输（与 DeepSeek 格式一致）
 * - 签名：通过 `delta.provider_specific_fields.thought_signatures` 传递
 * - 多轮回传：assistant 消息中通过 reasoning_content 字段回传历史思考内容
 *
 * 缓存：Gemini 的 Context Caching 是独立 API，OpenAI 兼容端点不暴露，因此不实现 heartbeat。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import type { GoogleProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { runSSEStream } from "../sse-utils.ts";
import {
	geminiChunkToStreamEvents,
	toGeminiMessages,
	toGeminiTools,
} from "./format.ts";
import type { GeminiRequest } from "./types.ts";

export {
	geminiChunkToStreamEvents,
	toGeminiMessages,
	toGeminiTools,
} from "./format.ts";
export type {
	GeminiMessage,
	GeminiRequest,
	GeminiToolCall,
	GeminiToolDef,
} from "./types.ts";

export class GeminiClient implements LLMClient {
	readonly modelId: string;
	private readonly pc: GoogleProviderConfig;
	private readonly apiUrl: string;
	private readonly format: FormatFn;

	constructor(pc: GoogleProviderConfig, format: FormatFn) {
		this.pc = pc;
		this.modelId = this.pc.model;
		this.format = format;

		const base = this.pc.base_url;
		if (base.includes("/chat/completions")) {
			this.apiUrl = base;
		} else {
			const cleanBase = base.replace(/\/v1\/?$/, "").replace(/\/$/, "");
			this.apiUrl = `${cleanBase}/v1/chat/completions`;
		}
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		const promptMessages = this.format(request.messages);
		const apiMessages = toGeminiMessages(promptMessages);

		const filteredMessages = filterEmptyMessages(apiMessages);

		const body: GeminiRequest = {
			model: this.modelId,
			messages: filteredMessages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (request.tools?.length) {
			body.tools = toGeminiTools(request.tools);
			body.tool_choice = request.toolChoice ?? "auto";
		}

		// Gemini 始终思考，必须传 reasoning_effort 才能让 thinking 独立流式传输
		body.reasoning_effort = this.pc.reasoning_effort;

		let res: Response;
		try {
			res = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.pc.api_key}`,
				},
				body: JSON.stringify(body),
				signal,
			});
		} catch (err) {
			if (isAbortError(err)) return;
			yield {
				type: "error",
				error: err instanceof Error ? err.message : String(err),
			};
			return;
		}

		if (!res.ok) {
			const text = await res.text();
			yield { type: "error", error: `Gemini API ${res.status}: ${text}` };
			return;
		}

		if (!res.body) {
			yield {
				type: "error",
				error: "Gemini streaming response has no body",
			};
			return;
		}

		yield* runSSEStream(res.body.getReader(), geminiChunkToStreamEvents);
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const messages = request.messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		const body: GeminiRequest = {
			model: this.modelId,
			messages,
			stream: false,
			reasoning_effort: this.pc.reasoning_effort,
		};

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		const res = await fetchWithRetry(() =>
			fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.pc.api_key}`,
				},
				body: JSON.stringify(body),
			}),
		);

		const json: unknown = await res.json();
		return { text: parseChatCompletionText(json) };
	}

	async ping(): Promise<{ ok: boolean; error?: string }> {
		// XXX: Gemini 通过 OpenAI 兼容网关走 stream，当前仅用于排除网络问题。如果未来网关提供了 GET /models 等轻量端点，应切换为直接 HTTP 请求，避免消息构建和流式解析开销。
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 15_000);
			try {
				for await (const event of this.stream(
					{
						messages: [{ type: "generic_user_text", content: "hi" }],
					},
					controller.signal,
				)) {
					if (event.type === "error") {
						return { ok: false, error: event.error };
					}
					controller.abort();
					break;
				}
			} finally {
				clearTimeout(timeout);
			}
			return { ok: true };
		} catch (err) {
			if (err instanceof Error) {
				if (isAbortError(err)) {
					return { ok: false, error: "连接超时（15s），请检查网络或 API 地址" };
				}
				return { ok: false, error: err.message.slice(0, 200) };
			}
			return { ok: false, error: `连接失败: ${String(err)}` };
		}
	}
}
