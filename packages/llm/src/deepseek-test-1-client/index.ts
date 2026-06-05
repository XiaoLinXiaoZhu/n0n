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
 */

import { formatSkills } from "@n0n/shared";
import triggerPromptContent from "./trigger-prompt.md";
import type {
	CompleteRequest,
	CompleteResponse,
	DomainMessage,
	LLMClient,
	PromptMessage,
	StreamEvent,
	StreamRequest,
	TagAdapter,
	ToolDefinition,
} from "@n0n/types";
import type { DeepSeekTest1ProviderConfig } from "../config.ts";
import { isAbortError, LLMError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";

// ── DeepSeek API Types (OpenAI-compatible) ──

interface DSMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: DSToolCall[];
	tool_call_id?: string;
}

interface DSToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

interface DSToolDef {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

interface DSRequest {
	model: string;
	messages: DSMessage[];
	tools?: DSToolDef[];
	tool_choice?: "auto" | "none" | "required";
	temperature?: number;
	max_tokens?: number;
	stream?: boolean;
	stream_options?: { include_usage: boolean };
	enable_thinking?: boolean;
	reasoning_effort?: "high" | "max";
}

// ── DomainMessage 预处理：拆分 system_with_skill ──

/**
 * 把 system_with_skill 改写为：
 * - 一条纯文本 system 消息（仅 content，丢弃 skill）
 * - 紧随其后插入一条 user 消息（触发 prompt + 全部 skill 文本）
 *
 * 普通 system / 其他消息原样保留。skills 为空时不注入 user 消息。
 */
export function splitSkillsToUser(
	messages: DomainMessage[],
	tags: TagAdapter,
): DomainMessage[] {
	const out: DomainMessage[] = [];
	for (const msg of messages) {
		if (msg.type === "system_with_skill") {
			out.push({ type: "system", content: msg.content });
			if (msg.skills.length > 0) {
				const skillsText = formatSkills(msg.skills, tags);
				const body = triggerPromptContent
					? `${triggerPromptContent}\n\n${skillsText}`
					: skillsText;
				out.push({ type: "generic_user_text", content: body });
			}
		} else {
			out.push(msg);
		}
	}
	return out;
}

// ── 去掉 progress tool 之前（含）的 assistant 消息的 reasoning ──

/**
 * 找到最后一个 toolName==="progress" 的消息索引，清空该索引之前（含）
 * 所有 assistant 消息的 reasoning 字段。
 *
 * @returns `{ messages, lastProgressIdx }` — `lastProgressIdx` 为最后一个
 * progress 的索引（-1 表示未找到），`messages` 为处理后的消息列表。
 */
export function stripReasoningFromPromptMessages(
	promptMessages: PromptMessage[],
): { messages: PromptMessage[]; lastProgressIdx: number } {
	let lastProgressIdx = -1;
	for (let i = 0; i < promptMessages.length; i++) {
		const msg = promptMessages[i];
		if (!msg) continue;
		if (
			msg.role === "tool" &&
			"toolName" in msg &&
			(msg as any).toolName === "progress"
		) {
			lastProgressIdx = i;
		}
	}
	if (lastProgressIdx === -1) return { messages: promptMessages, lastProgressIdx: -1 };

	return {
		messages: promptMessages.map((msg, idx) => {
			if (idx <= lastProgressIdx && msg.role === "assistant" && msg.reasoning) {
				return { ...msg, reasoning: undefined };
			}
			return msg;
		}),
		lastProgressIdx,
	};
}

// ── PromptMessage → API Message（跳过 system 由调用方处理） ──

function toApiMessages(
	promptMessages: PromptMessage[],
	enableThinking?: boolean,
): DSMessage[] {
	const result: DSMessage[] = [];
	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;
			case "user":
				result.push({ role: "user", content: msg.content });
				break;
			case "assistant": {
				const base: DSMessage = {
					role: "assistant",
					content: msg.content || null,
					...(enableThinking ? { reasoning_content: msg.reasoning ?? "" } : {}),
				};
				if (msg.toolCalls?.length) {
					base.tool_calls = msg.toolCalls.map((tc) => ({
						id: tc.id,
						type: "function" as const,
						function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
					}));
				}
				result.push(base);
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

function toApiTools(tools: ToolDefinition[]): DSToolDef[] {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

// ── deepseek-test-1 Client ──

export class DeepSeekTest1Client implements LLMClient {
	readonly modelId: string;
	private readonly pc: DeepSeekTest1ProviderConfig;
	private readonly apiUrl: string;
	private readonly format: FormatFn;
	private readonly tags: TagAdapter;
	private readonly stripReasoning: boolean;

	constructor(
		pc: DeepSeekTest1ProviderConfig,
		format: FormatFn,
		tags: TagAdapter,
		stripReasoning: boolean,
	) {
		this.pc = pc;
		this.modelId = pc.model;
		this.format = format;
		this.tags = tags;
		this.stripReasoning = stripReasoning;

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
		// 预处理：把 system_with_skill 的 skill 拆到第一个 user 消息
		const preprocessed = splitSkillsToUser(
			request.messages,
			this.tags,
		);

		let promptMessages = this.format(preprocessed);

		// 在 format 后、toApiMessages 前应用 strip_reasoning
		let lastProgressIdx = -1;
		if (this.stripReasoning) {
			const result = stripReasoningFromPromptMessages(promptMessages);
			promptMessages = result.messages;
			lastProgressIdx = result.lastProgressIdx;
		}

		// 在 PromptMessage 层面插入 trigger prompt（如果存在 progress tool_result）
		if (lastProgressIdx >= 0) {
			const triggerUserMsg: PromptMessage = {
				role: "user",
				content: triggerPromptContent,
			};
			promptMessages = [
				...promptMessages.slice(0, lastProgressIdx + 1),
				triggerUserMsg,
				...promptMessages.slice(lastProgressIdx + 1),
			];
		}

		const apiMessages = toApiMessages(promptMessages, this.pc.enable_thinking);

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
		const messages: DSMessage[] = request.messages.map((m) => ({
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
							`deepseek-test-1 API ${res.status}: ${text}`,
							res.status,
							text,
						);
						continue;
					}
					throw new LLMError(
						`deepseek-test-1 API ${res.status}: ${text}`,
						res.status,
						text,
					);
				}

				const json = (await res.json()) as {
					choices?: Array<{ message?: { content?: string | null } }>;
				};
				const text = json?.choices?.[0]?.message?.content ?? "";
				return { text };
			} catch (err) {
				if (err instanceof LLMError) throw err;
				lastError = err instanceof Error ? err : new Error(String(err));
			}
		}

		throw (
			lastError ?? new Error("deepseek-test-1 request failed after retries")
		);
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
