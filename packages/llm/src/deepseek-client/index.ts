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

import type { FormatFn } from "../factory.ts";
import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	PromptMessage,
	StreamEvent,
	StreamRequest,
	TagAdapter,
	TagStyle,
	TokenUsage,
	ToolDefinition,
} from "@n0n/types";
import type { DeepSeekProviderConfig } from "../config.ts";
import { isAbortError, LLMError } from "../errors.ts";
import { systemPromptAdapter } from "./system-prompt-adapter.ts";

// ── DeepSeek API Types (OpenAI-compatible) ──

interface DeepSeekMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: DeepSeekToolCall[];
	tool_call_id?: string;
}

interface DeepSeekToolCall {
	id: string;
	type: "function";
	function: {
		name: string;
		arguments: string;
	};
}

interface DeepSeekToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

interface DeepSeekRequest {
	model: string;
	messages: DeepSeekMessage[];
	tools?: DeepSeekToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	enable_thinking?: boolean;
	reasoning_effort?: "high" | "max";
}

// ── SSE Chunk Types ──

interface SSEChunk {
	choices?: Array<{
		index: number;
		delta: {
			role?: string;
			content?: string;
			reasoning_content?: string;
			tool_calls?: Array<{
				index: number;
				id?: string;
				type?: string;
				function?: {
					name?: string;
					arguments?: string;
				};
			}>;
		};
		finish_reason: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		prompt_cache_hit_tokens?: number;
		prompt_cache_miss_tokens?: number;
	};
}

function isSSEChunk(data: unknown): data is SSEChunk {
	if (typeof data !== "object" || data === null) return false;
	const obj = data as Record<string, unknown>;
	return Array.isArray(obj.choices) || obj.usage !== undefined;
}

// ── PromptMessage → DeepSeek Message 转换（跳过 system，由 adapter 单独处理） ──

function toDeepSeekMessages(
	promptMessages: PromptMessage[],
	enableThinking?: boolean,
): DeepSeekMessage[] {
	const result: DeepSeekMessage[] = [];

	for (const msg of promptMessages) {
		// system 消息由 systemPromptAdapter 统一处理，此处跳过
		if (msg.role === "system") continue;

		switch (msg.role) {
			case "user":
				result.push({ role: "user", content: msg.content });
				break;

			case "assistant": {
				if (msg.toolCalls?.length) {
					const toolCalls: DeepSeekToolCall[] = msg.toolCalls.map((tc) => ({
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
	}

	return result;
}

function toDeepSeekTools(tools: ToolDefinition[]): DeepSeekToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

// ── DeepSeek Client ──

export class DeepSeekClient implements LLMClient {
	readonly modelId: string;
	readonly tagStyle: TagStyle;
	readonly tags: TagAdapter;
	private readonly pc: DeepSeekProviderConfig;
	private readonly apiUrl: string;
	private readonly format: FormatFn;
	private readonly systemFormat: FormatFn;

	constructor(pc: DeepSeekProviderConfig, tagStyle: TagStyle, tags: TagAdapter, format: FormatFn, systemFormat: FormatFn) {
		this.pc = pc;
		this.modelId = this.pc.model;
		this.tagStyle = tagStyle;
		this.tags = tags;
		this.format = format;
		this.systemFormat = systemFormat;

		const base = this.pc.baseUrl ?? "https://api.deepseek.com";
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
		// 系统提示词走专用 adapter：提取、合并、适配为 DeepSeek 风格
		const adaptedSystemPrompt = systemPromptAdapter(request, this.systemFormat);

		// 非 system 消息走标准 formatPrompt → API 消息转换
		const promptMessages = this.format(request.messages);
		const apiMessages = toDeepSeekMessages(
			promptMessages,
			this.pc.enableThinking,
		);

		// 过滤空消息
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

		// 注入适配后的系统提示词为单一 system 消息
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

		if (this.pc.enableThinking) {
			body.enable_thinking = true;
		}

		if (this.pc.thinkingEffort) {
			body.reasoning_effort = this.pc.thinkingEffort;
		}

		let res: Response;
		try {
			res = await fetch(this.apiUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${this.pc.apiKey}`,
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

		let lastUsage: TokenUsage | null = null;
		let lastFinishReason: string | null = null;

		const processDataLine = function* (
			payload: string,
		): Generator<StreamEvent> {
			if (!payload || payload === "[DONE]") return;

			let chunk: unknown;
			try {
				chunk = JSON.parse(payload);
			} catch {
				return;
			}

			if (!isSSEChunk(chunk)) return;

			if (chunk.usage) {
				const u = chunk.usage;
				const cacheReadTokens = u.prompt_cache_hit_tokens ?? 0;
				const cacheWriteTokens = u.prompt_cache_miss_tokens ?? 0;
				const rawInput = u.prompt_tokens ?? 0;
				lastUsage = {
					inputTokens: rawInput - cacheReadTokens,
					outputTokens: u.completion_tokens ?? 0,
					totalTokens: u.total_tokens ?? 0,
					cacheReadTokens,
					cacheWriteTokens,
				};
			}

			const delta = chunk.choices?.[0]?.delta;
			if (delta) {
				if (delta.reasoning_content) {
					yield { type: "thinking", text: delta.reasoning_content };
				}
				if (delta.content) {
					yield { type: "content", text: delta.content };
				}
				if (delta.tool_calls) {
					for (const tc of delta.tool_calls) {
						yield {
							type: "tool_call_delta",
							index: tc.index,
							id: tc.id,
							name: tc.function?.name,
							arguments: tc.function?.arguments ?? "",
						};
					}
				}
			}

			const finish = chunk.choices?.[0]?.finish_reason;
			if (finish) {
				lastFinishReason = finish;
			}
		};

		const reader = res.body.getReader();
		const decoder = new TextDecoder();
		let buffer = "";

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });

				let boundary = buffer.indexOf("\n\n");
				while (boundary !== -1) {
					const raw = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);

					for (const line of raw.split("\n")) {
						if (!line.startsWith("data: ")) continue;
						const payload = line.slice(6);

						if (payload === "[DONE]") {
							if (lastFinishReason) {
								yield {
									type: "done",
									finishReason: lastFinishReason,
									usage: lastUsage,
								};
							}
							return;
						}

						yield* processDataLine(payload);
					}
					boundary = buffer.indexOf("\n\n");
				}
			}

			// Flush remaining buffer
			if (buffer.trim()) {
				for (const line of buffer.split("\n")) {
					if (!line.startsWith("data: ")) continue;
					const payload = line.slice(6);
					if (payload === "[DONE]") break;
					yield* processDataLine(payload);
				}
			}

			if (lastFinishReason) {
				yield {
					type: "done",
					finishReason: lastFinishReason,
					usage: lastUsage,
				};
			}
		} catch (err) {
			if (!isAbortError(err)) {
				yield {
					type: "error",
					error: err instanceof Error ? err.message : String(err),
				};
			}
		} finally {
			reader.releaseLock();
		}
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
						Authorization: `Bearer ${this.pc.apiKey}`,
					},
					body: JSON.stringify(body),
				});

				if (!res.ok) {
					const text = await res.text();
					if (res.status === 429 || res.status >= 500) {
						lastError = new LLMError(
							`DeepSeek API ${res.status}: ${text}`,
							res.status,
							text,
						);
						continue;
					}
					throw new LLMError(
						`DeepSeek API ${res.status}: ${text}`,
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

		throw lastError ?? new Error("DeepSeek request failed after retries");
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
					Authorization: `Bearer ${this.pc.apiKey}`,
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
