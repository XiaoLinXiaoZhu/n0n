/**
 * SSE 解析工具 — 无副作用纯函数
 *
 * OpenAI-compatible SSE 流的缓冲区管理和数据提取。
 * 各 Client 组合使用这些函数，避免重复实现。
 */

import type { StreamEvent, TokenUsage } from "@n0n/types";
import { isAbortError } from "./errors.ts";

// ── SSE Chunk 类型 ──

export interface SSEChunk {
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
			provider_specific_fields?: {
				thought_signatures?: string[];
			};
		};
		finish_reason: string | null;
	}>;
	usage?: {
		prompt_tokens?: number;
		completion_tokens?: number;
		total_tokens?: number;
		prompt_tokens_details?: {
			cached_tokens?: number;
		};
		prompt_cache_hit_tokens?: number;
		prompt_cache_miss_tokens?: number;
	};
}

// ── 缓冲区管理（纯函数） ──

/**
 * 从缓冲区中提取完整的 SSE 段（以 \n\n 分隔），返回段数组 + 剩余缓冲区。
 * 纯函数——无副作用，不修改输入。
 */
export function extractSSESegments(buffer: string): {
	segments: string[];
	remaining: string;
} {
	const segments: string[] = [];
	let remaining = buffer;

	let boundary = remaining.indexOf("\n\n");
	while (boundary !== -1) {
		segments.push(remaining.slice(0, boundary));
		remaining = remaining.slice(boundary + 2);
		boundary = remaining.indexOf("\n\n");
	}

	return { segments, remaining };
}

/**
 * 从 SSE 段中提取所有 `data: ` 行，返回 payload 数组。
 * 纯函数。
 */
export function parseSSESegment(segment: string): string[] {
	const payloads: string[] = [];
	for (const line of segment.split("\n")) {
		if (!line.startsWith("data: ")) continue;
		payloads.push(line.slice(6));
	}
	return payloads;
}

// ── Chunk 处理（纯函数） ──

/**
 * 类型守卫：判断未知数据是否为有效的 SSEChunk。
 */
export function isSSEChunk(data: unknown): data is SSEChunk {
	if (typeof data !== "object" || data === null) return false;
	const obj = data as Record<string, unknown>;
	return Array.isArray(obj.choices) || obj.usage !== undefined;
}

/**
 * 从 SSEChunk 中提取归一化的 TokenUsage。
 * 不同 provider 的 usage 格式在此统一。
 */
export function extractTokenUsage(chunk: SSEChunk): TokenUsage | null {
	if (!chunk.usage) return null;

	const u = chunk.usage;
	const cacheReadTokens =
		u.prompt_tokens_details?.cached_tokens ?? u.prompt_cache_hit_tokens ?? 0;
	const cacheWriteTokens = u.prompt_cache_miss_tokens ?? 0;
	const rawInput = u.prompt_tokens ?? 0;

	return {
		inputTokens: rawInput - cacheReadTokens,
		outputTokens: u.completion_tokens ?? 0,
		totalTokens: u.total_tokens ?? 0,
		cacheReadTokens,
		cacheWriteTokens,
	};
}

/**
 * chunk → StreamEvent 生成器。
 * 纯函数——基于 chunk 的 delta 字段产生事件，无副作用。
 */
export function* chunkToStreamEvents(chunk: SSEChunk): Generator<StreamEvent> {
	const delta = chunk.choices?.[0]?.delta;
	if (!delta) return;

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

// ── SSE 流编排（I/O 边界） ──

/**
 * 执行 SSE 流式请求的读取循环。
 *
 * 编排 reader/decoder 生命周期，将缓冲区管理委托给纯函数，
 * chunk 处理委托给 onChunk 回调。各 Client 传入自己的 chunk 处理器。
 *
 * @param reader — 响应体的 reader
 * @param onChunk — chunk → StreamEvent 生成器（纯函数回调）
 */
export async function* runSSEStream(
	reader: {
		read(): Promise<{ done: boolean; value?: Uint8Array }>;
		releaseLock(): void;
	},
	onChunk: (chunk: SSEChunk) => Generator<StreamEvent>,
): AsyncGenerator<StreamEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	let lastFinishReason: string | null = null;
	let lastUsage: TokenUsage | null = null;

	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			const { segments, remaining } = extractSSESegments(buffer);
			buffer = remaining;

			for (const segment of segments) {
				for (const payload of parseSSESegment(segment)) {
					if (!payload || payload === "[DONE]") {
						if (lastFinishReason) {
							yield {
								type: "done",
								finishReason: lastFinishReason,
								usage: lastUsage,
							};
						}
						return;
					}

					let chunk: unknown;
					try {
						chunk = JSON.parse(payload);
					} catch {
						continue;
					}

					if (!isSSEChunk(chunk)) continue;

					const usage = extractTokenUsage(chunk);
					if (usage) lastUsage = usage;

					const finish = chunk.choices?.[0]?.finish_reason;
					if (finish) lastFinishReason = finish;

					yield* onChunk(chunk);
				}
			}
		}

		// Flush remaining buffer
		if (buffer.trim()) {
			for (const payload of parseSSESegment(buffer)) {
				if (!payload || payload === "[DONE]") break;
				let chunk: unknown;
				try {
					chunk = JSON.parse(payload);
				} catch {
					continue;
				}
				if (!isSSEChunk(chunk)) continue;
				const usage = extractTokenUsage(chunk);
				if (usage) lastUsage = usage;
				yield* onChunk(chunk);
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
