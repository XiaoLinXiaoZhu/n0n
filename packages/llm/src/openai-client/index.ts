/**
 * OpenAI Client — OpenAI Chat Completions 协议实现
 *
 * 仅处理 provider="openai"（原生 OpenAI API）。
 * openai-compatible 见 openai-compatible-client/。
 *
 * 自实现 SSE 解析核心，特性：
 * - finishReason 传递到 StreamEvent.done
 * - delta.reasoning_content 处理
 * - error 事件：SSE 解析错误 → yield { type: "error" }
 * - token usage 统计
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import type { OpenAIProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";
import { toOpenAIMessages, toOpenAITools } from "./format.ts";
import type { OpenAIRequest } from "./types.ts";

export { toOpenAIMessages, toOpenAITools } from "./format.ts";
export type {
	OpenAIMessage,
	OpenAIRequest,
	OpenAIToolCall,
	OpenAIToolDef,
} from "./types.ts";

export class OpenAIClient implements LLMClient {
	readonly modelId: string;
	private readonly apiKey: string;
	private readonly apiUrl: string;
	private readonly format: FormatFn;

	constructor(pc: OpenAIProviderConfig, format: FormatFn) {
		this.modelId = pc.model;
		this.apiKey = pc.api_key;
		this.format = format;

		const base = pc.base_url;
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
		const apiMessages = toOpenAIMessages(promptMessages);

		const filteredMessages = filterEmptyMessages(apiMessages);

		const body: OpenAIRequest = {
			model: this.modelId,
			messages: filteredMessages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (request.tools?.length) {
			body.tools = toOpenAITools(request.tools);
			body.tool_choice = request.toolChoice ?? "auto";
		}

		let res: Response;
		try {
			res = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
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
			yield { type: "error", error: `LLM API ${res.status}: ${text}` };
			return;
		}

		if (!res.body) {
			yield { type: "error", error: "LLM streaming response has no body" };
			return;
		}

		yield* runSSEStream(res.body.getReader(), chunkToStreamEvents);
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const messages = request.messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		const body: OpenAIRequest = {
			model: this.modelId,
			messages,
			stream: false,
		};

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		const res = await fetchWithRetry(() =>
			fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.apiKey}`,
				},
				body: JSON.stringify(body),
			}),
		);

		const json: unknown = await res.json();
		return { text: parseChatCompletionText(json) };
	}

	async ping(): Promise<{ ok: boolean; error?: string }> {
		return pingModelsEndpoint(this.apiUrl, this.apiKey);
	}
}
