/**
 * OpenAI Compatible Client — 通过 OpenAI Chat Completions 兼容协议通信
 *
 * 处理 provider="openai-compatible"（如 litellm 代理、ppio 等）。
 * 原生 OpenAI 见 openai-client/。
 *
 * 与 OpenAI 原生客户端的差异：
 * - 支持 enable_thinking（reasoning_content 回传）
 * - 支持 backend_provider（anthropic backend 时注入 cache_control）
 * - base_url 必填（代理地址）
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import type { OpenAICompatibleProviderConfig } from "../config.ts";
import { parseBaseUrl, chatCompletionsUrl, modelsUrl, type BaseUrl } from "../base-url.ts";
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

export class OpenAICompatibleClient implements LLMClient {
	readonly modelId: string;
	private readonly apiKey: string;
	private readonly baseUrl: BaseUrl;
	private readonly format: FormatFn;
	private readonly enableThinking: boolean;
	private readonly backendProvider: string | undefined;

	constructor(pc: OpenAICompatibleProviderConfig, format: FormatFn) {
		this.modelId = pc.model;
		this.apiKey = pc.api_key;
		this.format = format;
		this.enableThinking = pc.enable_thinking;
		this.backendProvider = pc.backend_provider;

		const result = parseBaseUrl(pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		const promptMessages = this.format(request.messages);
		const apiMessages = toOpenAIMessages(
			promptMessages,
			this.enableThinking,
			this.backendProvider,
		);

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

		if (this.enableThinking) {
			body.enable_thinking = true;
		}

		let res: Response;
		try {
			res = await fetch(chatCompletionsUrl(this.baseUrl), {
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
			fetch(chatCompletionsUrl(this.baseUrl), {
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
		return pingModelsEndpoint(this.baseUrl, this.apiKey);
	}
}
