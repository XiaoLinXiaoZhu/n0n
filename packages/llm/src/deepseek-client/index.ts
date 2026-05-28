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
	PromptMessage,
	StreamEvent,
	StreamRequest,
	ToolDefinition,
} from "@n0n/types";
import type { DeepSeekProviderConfig } from "../config.ts";
import { isAbortError, LLMError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";
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
	private readonly pc: DeepSeekProviderConfig;
	private readonly apiUrl: string;
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
		const adaptedSystemPrompt = systemPromptAdapter(request, this.systemFormat);

		const promptMessages = this.format(request.messages);
		const apiMessages = toDeepSeekMessages(
			promptMessages,
			this.pc.enable_thinking,
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
						Authorization: `Bearer ${this.pc.api_key}`,
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
					Authorization: `Bearer ${this.pc.api_key}`,
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
