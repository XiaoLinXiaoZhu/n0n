/**
 * deepseek-test-1 Client — DeepSeek 的实验性变体
 *
 * 与标准 DeepSeekClient 的区别仅在系统提示词的组织方式：
 *
 * 1. 系统提示词只保留**纯文本**（system_with_skill 的 content）。
 *    挂载的 skill 不再拼进系统提示词。
 * 2. 系统提示词中挂载的 skill 被**拆分到第一个 user 消息**：
 *    该 user 消息 = 触发 prompt（从 trigger-prompt.md 读取）+ 全部 skill 文本。
 * 3. 因为系统提示词足够简短，**不前置 copy 一份工具定义**——
 *    依赖 API tools 参数自带的工具注入即可。
 *
 * 其余（OpenAI 兼容协议、SSE 解析、thinking、tools）与 DeepSeekClient 一致。
 * thinking / reasoning_effort 等厂商特定参数通过 extra_body 透传。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	PromptMessage,
	StreamEvent,
	StreamRequest,
	TagAdapter,
} from "@n0n/types";
import { type BaseUrl, chatCompletionsUrl, parseBaseUrl } from "../base-url.ts";
import type { DeepSeekTest1ProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";
import { toApiMessages, toApiTools } from "./format.ts";
import {
	splitSkillsToUser,
	stripReasoningFromPromptMessages,
	triggerPromptContent,
} from "./preprocess.ts";
import type { DSRequest } from "./types.ts";

export { toApiMessages, toApiTools } from "./format.ts";
export {
	splitSkillsToUser,
	stripReasoningFromPromptMessages,
	triggerPromptContent,
} from "./preprocess.ts";
export type { DSMessage, DSRequest, DSToolCall, DSToolDef } from "./types.ts";

export class DeepSeekTest1Client implements LLMClient {
	readonly modelId: string;
	private readonly pc: DeepSeekTest1ProviderConfig;
	private readonly baseUrl: BaseUrl;
	private readonly format: FormatFn;
	private readonly tags: TagAdapter;
	private readonly stripReasoning: boolean;
	private readonly memoryTag: boolean;

	constructor(
		pc: DeepSeekTest1ProviderConfig,
		format: FormatFn,
		tags: TagAdapter,
		stripReasoning: boolean,
		memoryTag: boolean,
	) {
		this.pc = pc;
		this.modelId = pc.model;
		this.format = format;
		this.tags = tags;
		this.stripReasoning = stripReasoning;
		this.memoryTag = memoryTag;

		const result = parseBaseUrl(this.pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		// 预处理：把 system_with_skill 的 skill 拆到第一个 user 消息
		const preprocessed = splitSkillsToUser(request.messages, this.tags);

		let promptMessages = this.format(preprocessed);

		// 在 format 后、toApiMessages 前应用 strip_reasoning
		let lastProgressIdx = -1;
		if (this.stripReasoning) {
			const result = stripReasoningFromPromptMessages(promptMessages);
			promptMessages = result.messages;
			lastProgressIdx = result.lastProgressIdx;
		}

		// 在消息数组末尾插入 trigger prompt（如果存在 progress tool_result）
		if (lastProgressIdx >= 0) {
			const triggerUserMsg: PromptMessage = {
				role: "user",
				content: triggerPromptContent,
			};
			promptMessages = [...promptMessages, triggerUserMsg];
		}

		const apiMessages = toApiMessages(promptMessages, this.memoryTag);

		const filteredMessages = filterEmptyMessages(apiMessages);

		const body: DSRequest = {
			model: this.modelId,
			messages: filteredMessages,
			stream: true,
			stream_options: { include_usage: true },
		};

		if (request.tools?.length) {
			body.tools = toApiTools(request.tools);
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
			yield {
				type: "error",
				error: `deepseek-test-1 API ${res.status}: ${text}`,
			};
			return;
		}

		if (!res.body) {
			yield {
				type: "error",
				error: "deepseek-test-1 streaming response has no body",
			};
			return;
		}

		yield* runSSEStream(res.body.getReader(), chunkToStreamEvents);
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const messages = request.messages.map((m) => ({
			role: m.role,
			content: m.content,
		}));

		const body: DSRequest = {
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
