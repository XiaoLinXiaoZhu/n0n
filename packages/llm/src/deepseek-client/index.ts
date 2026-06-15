/**
 * DeepSeek Client — DeepSeek 专用 LLM Client
 *
 * 基于 OpenAI Chat Completions 兼容协议，针对 DeepSeek 做专项适配：
 * - 系统提示词：通过 systemPromptAdapter 提取、合并、适配为 DeepSeek 原生 Markdown 风格
 * - 思考模式：支持 enable_thinking，reasoning_content 流式传输
 * - Tag 风格：默认 "deepseek"（## tagname / ---）
 *
 * 走正常的 formatPrompt → TagAdapter 路线，不绕过 tag 适配体系。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import type { DeepSeekProviderConfig } from "../config.ts";
import { parseBaseUrl, chatCompletionsUrl, modelsUrl, type BaseUrl } from "../base-url.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";
import { toDeepSeekMessages, toDeepSeekTools } from "./format.ts";
import { systemPromptAdapter } from "./system-prompt-adapter.ts";
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
	private readonly systemFormat: FormatFn;

	constructor(
		pc: DeepSeekProviderConfig,
		format: FormatFn,
		systemFormat: FormatFn,
	) {
		this.pc = pc;
		this.modelId = this.pc.model;
		this.format = format;
		this.systemFormat = systemFormat;

		const result = parseBaseUrl(this.pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		const adaptedSystemPrompt = systemPromptAdapter(request, this.systemFormat);

		const promptMessages = this.format(request.messages);
		const apiMessages = toDeepSeekMessages(
			promptMessages,
			this.pc.enable_thinking,
		);

		const filteredMessages = filterEmptyMessages(apiMessages);

		const messages: DeepSeekMessage[] = adaptedSystemPrompt
			? [{ role: "system", content: adaptedSystemPrompt }, ...filteredMessages]
			: filteredMessages;

		const body: DeepSeekRequest = {
			model: this.modelId,
			messages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (request.tools?.length) {
			body.tools = toDeepSeekTools(request.tools);
			body.tool_choice = request.toolChoice ?? "auto";
		}

		if (this.pc.enable_thinking) {
			body.enable_thinking = true;
		}

		if (this.pc.reasoning_effort) {
			body.reasoning_effort = this.pc.reasoning_effort;
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
