/**
 * Agent Loop — 纯编排层
 *
 * 每一步都是一个清晰的函数调用：
 * 1. parseStream  → 流式解析，yield 语义事件
 * 2. scheduler    → 流水线并行执行（streaming 中工具就绪即入队）
 * 3. round.*      → 纯函数后处理（截断恢复、消息构建）
 *
 * scheduler 通过回调发射 raw 无序事件，排序由各 Renderer 实现自行决定。
 */

import type { Toolkit } from "@n0n/tools";
import type {
	DomainMessage,
	LLMClient,
	PartialToolCallRecord,
	Renderer,
	TokenUsage,
	ToolCallRecord,
	ToolDefinition,
} from "@n0n/types";
import { FinishReason } from "@n0n/types";

import { PlainRenderer } from "../ui/renderer.ts";
import {
	buildToolCallMessage,
	collectJobMessages,
	recoverTruncatedCalls,
} from "./round.ts";
import { ExecutionScheduler } from "./scheduler.ts";
import { parseStream, type StreamingResult } from "./streaming.ts";

// ── 结果类型 ──

export interface AgentResult<T = unknown> {
	/** 首个 show 结果；兼容旧调用方，优先使用 results。 */
	result: T | null;
	/** 本轮返回的全部 show 结果，按本轮工具调度顺序排列。 */
	results: T[];
	report: string | null;
	history: DomainMessage[];
	/** 本轮使用的工具定义列表（供 heartbeat 重建缓存前缀） */
	tools: ToolDefinition[];
}

export interface AgentOptions<_T = unknown> {
	/** 主 LLM Client 实例 */
	client: LLMClient;
	/** 工具集实例 — 由 app 层通过 makeToolkit 构造并注入 */
	toolkit: Toolkit;
	max_iterations?: number;
	max_idle_rounds?: number;
	renderer?: Renderer;
	confirmFn?: (question: string) => Promise<string>;
	signal?: AbortSignal;
}

// ── Agent Loop ──

export async function agentLoop<T = unknown>(
	history: DomainMessage[],
	options: AgentOptions<T>,
): Promise<AgentResult<T>> {
	const maxIter = options.max_iterations ?? 50;
	const maxIdleRounds = options.max_idle_rounds ?? 5;
	const renderer: Renderer = options.renderer ?? new PlainRenderer();
	const client = options.client;
	const toolkit = options.toolkit;
	const toolSession = toolkit.bind(options.confirmFn);
	const messages: DomainMessage[] = [...history];
	let idleCount = 0;

	for (let iter = 0; iter < maxIter; iter++) {
		if (options.signal?.aborted) {
			renderer.aborted();
			return {
				result: null,
				results: [],
				report: null,
				history: messages,
				tools: toolkit.tools,
			};
		}

		renderer.roundStart(iter + 1, maxIter, messages.length);

		// ── 1. 流式解析 + 并行执行（交织进行） ──
		const scheduler = new ExecutionScheduler({
			onRegister: (tc) => renderer.toolExecStart(tc.id, tc),
			onChunk: (tcId, tool, chunk) => renderer.toolExecChunk(tcId, tool, chunk),
			onEnd: (tcId, outcome) => renderer.toolExecEnd(tcId, outcome),
		});
		const runPromise = scheduler.run(options.signal);

		let streamResult: StreamingResult | null = null;

		for await (const event of parseStream(
			client.stream(
				{ messages, tools: toolkit.tools, toolChoice: "auto" },
				options.signal,
			),
			options.signal,
		)) {
			switch (event.type) {
				case "thinking_start":
					renderer.thinkingStart();
					break;
				case "thinking_chunk":
					renderer.thinkingChunk(event.text);
					break;
				case "thinking_end":
					renderer.thinkingEnd();
					break;
				case "content_start":
					renderer.contentStart();
					break;
				case "content_chunk":
					renderer.contentChunk(event.text);
					break;
				case "content_end":
					renderer.contentEnd();
					break;
				case "tool_arg_start":
					renderer.toolCallArgStart(event.index, event.name);
					break;
				case "tool_arg_chunk":
					renderer.toolCallArgChunk(event.index, event.chunk);
					break;
				case "tool_ready":
					renderer.toolCallArgEnd(event.index, event.tc);
					scheduler.enqueue(toolSession.createJob(event.tc));
					break;
				case "done":
					streamResult = event.result;
					break;
				case "error":
					break;
				default: {
					const _exhaustive: never = event;
					break;
				}
			}
		}
		renderer.streamEnd();

		const result = streamResult;
		if (!result) {
			scheduler.seal();
			await runPromise;
			return {
				result: null,
				results: [],
				report:
					"Agent terminated: stream parsing failed without producing a result",
				history: messages,
				tools: toolkit.tools,
			};
		}

		// ── 2. 分类本轮结果，决定后续动作 ──
		const outcome = classifyRound(result, idleCount, maxIdleRounds);

		const roundUsage = result.accumulator.usage;
		const roundFinishReason = result.accumulator.finishReason ?? "unknown";

		if (outcome.action === "exit") {
			scheduler.seal();
			if (outcome.assistantMessage) {
				messages.push(outcome.assistantMessage);
			}
			pushTokenUsage(messages, roundUsage, roundFinishReason);
			renderer.roundEnd(roundUsage);
			if (outcome.reason === "aborted") renderer.aborted();
			else renderer.agentTerminated(outcome.reason);
			return {
				result: null,
				results: [],
				report: outcome.report,
				history: messages,
				tools: toolkit.tools,
			};
		}

		if (outcome.action === "idle") {
			scheduler.seal();
			messages.push(outcome.assistantMessage);
			pushTokenUsage(messages, roundUsage, roundFinishReason);
			idleCount++;
			if (idleCount >= maxIdleRounds) {
				renderer.roundEnd(roundUsage);
				renderer.agentTerminated("max idle rounds exceeded (no tool calls)");
				return {
					result: null,
					results: [],
					report: `Agent terminated: max idle rounds exceeded. Last content: ${(result.accumulator.content || "").slice(0, 200)}`,
					history: messages,
					tools: toolkit.tools,
				};
			}
			messages.push({
				type: "idle_nudge",
				idleCount,
				maxIdleRounds: maxIdleRounds,
			});
			renderer.roundEnd(roundUsage);
			continue;
		}

		if (outcome.action === "retry_truncated") {
			scheduler.seal();
			messages.push(outcome.assistantMessage);
			messages.push(outcome.retryMessage);
			pushTokenUsage(messages, roundUsage, roundFinishReason);
			renderer.roundEnd(roundUsage);
			continue;
		}

		// outcome.action === "execute_tools"
		idleCount = 0;

		// ── 3. 截断恢复 + seal ──
		const truncation = await recoverTruncatedCalls(result, toolSession.recover);
		scheduler.seal();

		const allCalls: (ToolCallRecord | PartialToolCallRecord)[] = [
			...result.readyTools.values(),
			...truncation.map((p) => p.call),
		];

		if (allCalls.length === 0) {
			renderer.roundEnd(roundUsage);
			continue;
		}

		// ── 4. 构建 assistant 消息 ──
		messages.push(buildToolCallMessage(result.accumulator, allCalls));
		pushTokenUsage(messages, roundUsage, roundFinishReason);

		// ── 5. 等待执行 + 渲染完成 ──
		await runPromise;

		// ── 6. 收集结果消息 ──
		messages.push(...collectJobMessages(scheduler.orderedJobs()));
		for (const pair of truncation) {
			messages.push(pair.result);
		}

		// ── 7. 检测 show 调用 → 终止循环并按顺序返回全部结果 ──
		const showResults: T[] = [];
		for (const job of scheduler.orderedJobs()) {
			if (job.status === "completed" && job.result.tool === "show") {
				showResults.push(job.result.cleanedResult as T);
			}
		}
		if (showResults.length > 0) {
			renderer.roundEnd(roundUsage);
			renderer.showAccepted();
			return {
				result: showResults[0] ?? null,
				results: showResults,
				report: null,
				history: messages,
				tools: toolkit.tools,
			};
		}

		renderer.roundEnd(roundUsage);
	}

	return {
		result: null,
		results: [],
		report: `Agent terminated: max iterations (${maxIter}) exceeded`,
		history: messages,
		tools: toolkit.tools,
	};
}

// ── 本轮结果分类（纯函数） ──

type RoundOutcome =
	| {
			action: "exit";
			reason: string;
			report: string | null;
			assistantMessage?: import("@n0n/types").AssistantTextMessage;
	  }
	| {
			action: "idle";
			assistantMessage: import("@n0n/types").AssistantTextMessage;
	  }
	| {
			action: "retry_truncated";
			assistantMessage: import("@n0n/types").AssistantTextMessage;
			retryMessage: import("@n0n/types").GenericUserTextMessage;
	  }
	| { action: "execute_tools" };

function classifyRound(
	result: StreamingResult,
	_idleCount: number,
	_maxIdleRounds: number,
): RoundOutcome {
	const hasReadyTools = result.readyTools.size > 0;
	const hasIncomplete =
		result.accumulator.toolCalls.size > result.readyTools.size;
	const hasAnyTools = hasReadyTools || hasIncomplete;
	const acc = result.accumulator;

	if (result.interrupt === "aborted" && !hasAnyTools) {
		return { action: "exit", reason: "aborted", report: null };
	}

	if (result.interrupt === "error" && !hasReadyTools) {
		return {
			action: "exit",
			reason: result.errorMessage ?? "LLM error",
			report: result.errorMessage ?? "LLM stream error",
		};
	}

	if (acc.finishReason === FinishReason.CONTENT_FILTER) {
		return {
			action: "exit",
			reason: "Content was filtered by the model provider",
			report: "Agent terminated: content filter triggered",
			assistantMessage: {
				type: "assistant_text",
				content: acc.content || "",
				reasoning: acc.reasoning
					? { ok: true as const, value: acc.reasoning }
					: { ok: false as const },
				reasoningSignature: acc.reasoningSignature,
			},
		};
	}

	if (result.interrupt === "length" && !hasAnyTools) {
		return {
			action: "retry_truncated",
			assistantMessage: {
				type: "assistant_text",
				content: acc.content || "",
				reasoning: acc.reasoning
					? { ok: true as const, value: acc.reasoning }
					: { ok: false as const },
				reasoningSignature: acc.reasoningSignature,
			},
			retryMessage: {
				type: "generic_user_text",
				content:
					"Your previous response was truncated due to max_tokens limit. Please retry with a shorter response, or break the task into smaller steps.",
			},
		};
	}

	if (!hasAnyTools) {
		return {
			action: "idle",
			assistantMessage: {
				type: "assistant_text",
				content: acc.content ?? "",
				reasoning: acc.reasoning
					? { ok: true as const, value: acc.reasoning }
					: { ok: false as const },
				reasoningSignature: acc.reasoningSignature,
			},
		};
	}

	return { action: "execute_tools" };
}

// ── pushTokenUsage ──

function pushTokenUsage(
	messages: DomainMessage[],
	usage: TokenUsage | null | undefined,
	finishReason: string,
): void {
	if (usage) {
		messages.push({ type: "token_usage" as const, usage, finishReason });
	}
}
