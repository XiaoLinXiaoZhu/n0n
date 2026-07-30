/**
 * Anthropic Client — Anthropic Messages API 协议实现
 *
 * 实现 LLMClient 接口，通过原生 fetch + SSE 解析与 Anthropic API 通信。
 *
 * 特性：
 * - Prompt caching：支持两种模式
 *   - 显式断点：DomainMessage 中的 cache_breakpoint 标记转换为 content block 级 cache_control
 *   - 自动缓存：请求顶层 cache_control（Anthropic 20 块回溯窗口），始终启用作为末尾兜底
 * - system 消息拆离（Anthropic 格式要求 system 在消息体外）
 * - thinking / output_config 等厂商特定参数通过 extra_body 透传
 *
 * 类型定义见 types.ts，格式转换见 format.ts，stream 逻辑见 stream.ts。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
	TokenUsage,
} from "@n0n/types";
import { type BaseUrl, messagesUrl, parseBaseUrl } from "../base-url.ts";
import type { AnthropicProviderConfig } from "../config.ts";
import { isAbortError, LLMError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import {
	AnthropicUsageSchema,
	parseAnthropicCompletionText,
} from "../schemas.ts";
import { DEFAULT_COMPLETE_MAX_TOKENS } from "./constants.ts";
import { toAnthropicFormat, toAnthropicTools } from "./format.ts";
import { anthropicStream } from "./stream.ts";
import type { AnthropicMessage, AnthropicRequest } from "./types.ts";

export class AnthropicClient implements LLMClient {
	readonly modelId: string;
	private readonly pc: AnthropicProviderConfig;
	private readonly baseUrl: BaseUrl;
	private readonly format: FormatFn;
	/** stream() 需要的上下文，避免逐个字段传递 */
	private readonly streamCtx;

	constructor(pc: AnthropicProviderConfig, format: FormatFn) {
		this.pc = pc;
		this.modelId = this.pc.model;
		this.format = format;

		const result = parseBaseUrl(pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;

		this.streamCtx = {
			modelId: this.modelId,
			apiUrl: messagesUrl(this.baseUrl),
			format: this.format,
			pc: this.pc,
		};
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		yield* anthropicStream(this.streamCtx, request, signal);
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const messages: AnthropicMessage[] = [];
		let system = "";

		for (const m of request.messages) {
			if (m.role === "system") {
				system += (system ? "\n\n" : "") + m.content;
			} else {
				messages.push({ role: "user", content: m.content });
			}
		}

		const body: AnthropicRequest = {
			model: this.modelId,
			max_tokens: DEFAULT_COMPLETE_MAX_TOKENS,
			system,
			messages,
			stream: false,
		};

		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}

		// extra_body 透传 — 可覆盖以上任意字段（含 thinking、output_config 等）
		if (this.pc.extra_body) {
			Object.assign(body, this.pc.extra_body);
		}

		const maxRetries = 3;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = Math.min(1000 * 2 ** attempt, 10_000);
				await new Promise((r) => setTimeout(r, delay));
			}

			try {
				const res = await fetch(messagesUrl(this.baseUrl), {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"x-api-key": this.pc.api_key,
						"anthropic-version": "2023-06-01",
					},
					body: JSON.stringify(body),
				});

				if (!res.ok) {
					const text = await res.text();
					if (res.status === 429 || res.status >= 500) {
						lastError = new LLMError(
							`Anthropic API ${res.status}: ${text}`,
							res.status,
							text,
						);
						continue;
					}
					throw new LLMError(
						`Anthropic API ${res.status}: ${text}`,
						res.status,
						text,
					);
				}

				const json: unknown = await res.json();
				return { text: parseAnthropicCompletionText(json) };
			} catch (err) {
				if (err instanceof LLMError) throw err;
				lastError = err instanceof Error ? err : new Error(String(err));
			}
		}

		throw lastError ?? new Error("Anthropic request failed after retries");
	}

	async heartbeat(request: StreamRequest): Promise<TokenUsage | null> {
		const promptMessages = this.format(request.messages);
		const { system, messages: anthropicMessages } =
			toAnthropicFormat(promptMessages);

		// heartbeat 用于刷新提示词缓存：max_tokens=1 即可，
		// 思考输出由 extra_body 中的 output_config.effort 统一控制。
		const body: AnthropicRequest = {
			model: this.modelId,
			max_tokens: 1,
			system,
			messages: anthropicMessages,
			stream: false,
		};

		if (request.tools?.length) {
			body.tools = toAnthropicTools(request.tools);
			const tc = request.toolChoice ?? "auto";
			body.tool_choice = { type: tc === "required" ? "any" : tc };
		}

		// extra_body 透传 — 可覆盖以上任意字段
		if (this.pc.extra_body) {
			Object.assign(body, this.pc.extra_body);
		}
		// 确保 max_tokens=1 用于缓存刷新（extra_body 可能覆盖）
		body.max_tokens = 1;

		try {
			const res = await fetch(messagesUrl(this.baseUrl), {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"x-api-key": this.pc.api_key,
					"anthropic-version": "2023-06-01",
				},
				body: JSON.stringify(body),
			});

			if (!res.ok) return null;

			const json: unknown = await res.json();
			const parsed = AnthropicUsageSchema.parse(json);
			const u = parsed?.usage;
			if (!u) return null;

			return {
				inputTokens: u.input_tokens ?? 0,
				outputTokens: u.output_tokens ?? 0,
				totalTokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0),
				cacheReadTokens: u.cache_read_input_tokens ?? 0,
				cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
			};
		} catch {
			return null;
		}
	}

	async ping(): Promise<{ ok: boolean; error?: string }> {
		// XXX: Anthropic 无轻量 health check 端点，当前通过 stream 发送空消息排除网络问题。如果未来 Anthropic 提供了等效端点（如 GET /v1/models），应切换为直接 HTTP 请求，避免消息构建和 token 消耗。
		try {
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 15_000);
			try {
				for await (const event of this.stream(
					{ messages: [{ type: "generic_user_text", content: "hi" }] },
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
