/**
 * OpenAI Compatible Client — 通过 OpenAI Chat Completions 兼容协议通信
 *
 * 处理 provider="openai-compatible"（如 litellm 代理、ppio 等）。
 * 原生 OpenAI 见 openai-client.ts。
 *
 * 与 OpenAI 原生客户端的差异：
 * - 支持 enable_thinking（reasoning_content 回传）
 * - 支持 backend_provider（an anthropic backend 时注入 cache_control）
 * - base_url 必填（代理地址）
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	PromptMessage,
	StreamEvent,
	StreamRequest,
	ToolDefinition,
} from "@n0n/types";
import type { OpenAICompatibleProviderConfig } from "./config.ts";
import { isAbortError, LLMError } from "./errors.ts";
import type { FormatFn } from "./factory.ts";
import { chunkToStreamEvents, runSSEStream } from "./sse-utils.ts";

// ── API Types ──

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: OpenAIToolCall[];
	tool_call_id?: string;
}

interface OpenAIToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface OpenAIToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

interface OpenAIRequest {
	model: string;
	messages: OpenAIMessage[];
	tools?: OpenAIToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	enable_thinking?: boolean;
}

// ── PromptMessage → OpenAI Message 转换 ──

function toOpenAIMessages(
	promptMessages: PromptMessage[],
	enableThinking: boolean,
	backendProvider: string | undefined,
): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];

	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;

			case "user":
				result.push({ role: "user", content: msg.content });
				break;

			case "assistant": {
				if (msg.toolCalls?.length) {
					const toolCalls: OpenAIToolCall[] = msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: {
							name: tc.tool,
							arguments: JSON.stringify(tc.args),
						},
					}));
					result.push({
						role: "assistant",
						content: msg.content || null,
						...(enableThinking
							? { reasoning_content: msg.reasoning ?? "" }
							: {}),
						tool_calls: toolCalls,
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
						...(enableThinking
							? { reasoning_content: msg.reasoning ?? "" }
							: {}),
					});
				}
				break;
			}

			case "tool":
				result.push({
					role: "tool",
					content: msg.content,
					tool_call_id: msg.toolCallId,
				});
				break;
		}

		// Anthropic via litellm: 注入 cache_control 断点
		// TODO: 当 litellm/openai 类型支持 cache_control 时移除 double cast
		if (
			backendProvider === "anthropic" &&
			msg.cacheBreakpoint &&
			result[result.length - 1]
		) {
			(
				result[result.length - 1] as unknown as Record<string, unknown>
			).cache_control = {
				type: "ephemeral",
			};
		}
	}

	// litellm + anthropic backend：末尾自动添加缓存标记，配合显式断点实现双重缓存
	if (backendProvider === "anthropic") {
		const last = result[result.length - 1];
		if (last) {
			(last as unknown as Record<string, unknown>).cache_control = {
				type: "ephemeral",
			};
		}
	}

	return result;
}

function toOpenAITools(tools: ToolDefinition[]): OpenAIToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

// ── OpenAI Compatible Client ──

export class OpenAICompatibleClient implements LLMClient {
	readonly modelId: string;
	private readonly apiKey: string;
	private readonly apiUrl: string;
	private readonly format: FormatFn;
	private readonly enableThinking: boolean;
	private readonly backendProvider: string | undefined;

	constructor(pc: OpenAICompatibleProviderConfig, format: FormatFn) {
		this.modelId = pc.model;
		this.apiKey = pc.api_key;
		this.format = format;
		this.enableThinking = pc.enable_thinking;
		this.backendProvider = pc.backend_provider;

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
		const apiMessages = toOpenAIMessages(
			promptMessages,
			this.enableThinking,
			this.backendProvider,
		);

		const filteredMessages = apiMessages.filter((msg) => {
			if (msg.role === "user" && !(msg.content ?? "").trim()) return false;
			if (
				msg.role === "assistant" &&
				!msg.content?.trim() &&
				!msg.tool_calls?.length
			)
				return false;
			return true;
		});

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
		const messages: OpenAIMessage[] = request.messages.map((m) => ({
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

		const maxRetries = 3;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt < maxRetries; attempt++) {
			if (attempt > 0) {
				const delay = Math.min(1000 * 2 ** attempt, 10_000);
				await new Promise((r) => setTimeout(r, delay));
			}

			try {
				const res = await fetch(this.apiUrl, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${this.apiKey}`,
					},
					body: JSON.stringify(body),
				});

				if (!res.ok) {
					const text = await res.text();
					if (res.status === 429 || res.status >= 500) {
						lastError = new LLMError(
							`LLM API ${res.status}: ${text}`,
							res.status,
							text,
						);
						continue;
					}
					throw new LLMError(
						`LLM API ${res.status}: ${text}`,
						res.status,
						text,
					);
				}

				const json = (await res.json()) as {
					choices?: Array<{
						message?: { content?: string | null };
					}>;
				};
				const text = json?.choices?.[0]?.message?.content ?? "";
				return { text };
			} catch (err) {
				if (err instanceof LLMError) throw err;
				lastError = err instanceof Error ? err : new Error(String(err));
			}
		}

		throw lastError ?? new Error("LLM request failed after retries");
	}

	async ping(): Promise<{ ok: boolean; error?: string }> {
		try {
			const modelsUrl = this.apiUrl.replace(
				/\/chat\/completions\/?$/,
				"/models",
			);
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 15_000);
			const resp = await fetch(modelsUrl, {
				method: "GET",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json",
				},
				signal: controller.signal,
			});
			clearTimeout(timeout);

			if (resp.ok) return { ok: true as const };

			if (resp.status === 401 || resp.status === 403) {
				return { ok: false as const, error: "认证失败，请检查 API Key" };
			}
			const text = await resp.text().catch(() => "");
			return {
				ok: false as const,
				error: `API ${resp.status}: ${text.slice(0, 200)}`,
			};
		} catch (err) {
			if (err instanceof Error) {
				if (isAbortError(err) || err.name === "TimeoutError") {
					return {
						ok: false as const,
						error: "连接超时（15s），请检查网络或 API 地址",
					};
				}
				return { ok: false as const, error: err.message.slice(0, 200) };
			}
			return { ok: false as const, error: `连接失败: ${String(err)}` };
		}
	}
}
