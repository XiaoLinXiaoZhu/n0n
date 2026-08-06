/**
 * DeepSeek Client — DeepSeek 专用 LLM Client
 *
 * 基于 OpenAI Chat Completions 兼容协议实现。
 *
 * thinking / reasoning_effort 等厂商特定参数通过 extra_body 透传。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import { type BaseUrl, chatCompletionsUrl, parseBaseUrl } from "../base-url.ts";
import type { DeepSeekProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";
import { toDeepSeekMessages, toDeepSeekTools } from "./format.ts";
import type { DeepSeekMessage, DeepSeekRequest } from "./types.ts";

export { toDeepSeekMessages, toDeepSeekTools } from "./format.ts";
export type {
	DeepSeekMessage,
	DeepSeekRequest,
	DeepSeekToolCall,
	DeepSeekToolDef,
} from "./types.ts";

export class DeepSeekClient implements LLMClient {
	readonly modelId: string;
	private readonly pc: DeepSeekProviderConfig;
	private readonly baseUrl: BaseUrl;
	private readonly format: FormatFn;

	constructor(pc: DeepSeekProviderConfig, format: FormatFn) {
		this.pc = pc;
		this.modelId = this.pc.model;
		this.format = format;

		const result = parseBaseUrl(this.pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		const promptMessages = this.format(request.messages);
		const apiMessages = toDeepSeekMessages(promptMessages);

		const filteredMessages = filterEmptyMessages(apiMessages);

		const body: DeepSeekRequest = {
			model: this.modelId,
			messages: filteredMessages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (request.tools?.length) {
			body.tools = toDeepSeekTools(request.tools);
			body.tool_choice = request.toolChoice ?? "auto";
		}

		// extra_body 透传 — 可覆盖以上任意字段（含 thinking、enable_thinking、reasoning_effort 等）
		if (this.pc.extra_body) {
			Object.assign(body, this.pc.extra_body);
		}

		let res: Response;
		try {
			res = await fetch(chatCompletionsUrl(this.baseUrl), {
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
			yield { type: "error", error: `DeepSeek API ${res.status}: ${text}` };
			return;
		}

		if (!res.body) {
			yield {
				type: "error",
				error: "DeepSeek streaming response has no body",
			};
			return;
		}

		yield* runSSEStream(res.body.getReader(), chunkToStreamEvents);
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const messages: DeepSeekMessage[] = request.messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		const body: DeepSeekRequest = {
			model: this.modelId,
			messages,
			stream: false,
		};

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		if (this.pc.extra_body) {
			Object.assign(body, this.pc.extra_body);
		}

		const res = await fetchWithRetry(() =>
			fetch(chatCompletionsUrl(this.baseUrl), {
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
		return pingModelsEndpoint(this.baseUrl, this.pc.api_key);
	}
}
