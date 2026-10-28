/**
 * @n0n/tools — post 工具传输层
 *
 * 唯一工具 `post`，参数为 uri + body。本文件是传输层：
 * 边界解析（parse-don't-validate）、tool_arg_error 契约、
 * 描述组装、调度策略解释器。不含任何 scheme 实现知识——
 * 各后端自治于 `schemes/` 注册表（见 schemes/index.ts）。
 */

import type {
	CanStartFn,
	PostToolCall,
	ToolCallRecord,
	ToolDefinition,
} from "@n0n/types";
import { PostArgsSchema } from "@n0n/types";
import type { ToolsConfig } from "./config.ts";
import { makePostToolDefinition } from "./exec/definition.ts";
import { extractUriBody, type PartialToolCall } from "./recovery.ts";
import { type ParsedUri, schemeFor } from "./schemes/index.ts";
import type { SchemeContext } from "./schemes/types.ts";
import {
	createToolkitSession,
	type ToolEntry,
	type ToolkitSession,
} from "./session.ts";
import { parsePostUri } from "./uri.ts";

// ── 单 entry 注册表 ──

/** uri 解析失败返回 null（canStart 用；execute 走 tool_arg_error 出口） */
function safeParseUri(uri: string): ParsedUri | null {
	try {
		return parsePostUri(uri);
	} catch {
		return null;
	}
}

/** 解析产物的调度事实（缓存，避免 canStart 每次检查重复解析） */
interface ScheduleFacts {
	exclusive: boolean;
	resourceKey: string | null;
}

const factsCache = new WeakMap<ToolCallRecord, ScheduleFacts | null>();

function scheduleFactsOf(call: ToolCallRecord): ScheduleFacts | null {
	if (factsCache.has(call)) return factsCache.get(call) ?? null;
	const parsed = safeParseUri(call.args.uri);
	if (!parsed) {
		factsCache.set(call, null);
		return null;
	}
	const handler = schemeFor(parsed.scheme);
	const facts: ScheduleFacts = {
		exclusive: handler?.exclusive === true,
		resourceKey: handler?.resourceKey
			? // resourceKey 以 scheme 为命名空间：不同 scheme 的 key 不互斥
				`${parsed.scheme}:${handler.resourceKey(parsed)}`
			: null,
	};
	factsCache.set(call, facts);
	return facts;
}

/**
 * post 的并行准入——调度策略解释器（读 scheme 声明的事实，不写 scheme 规则）：
 * - 空 active set：允许并行
 * - 任一侧声明 exclusive（customer）：阻塞
 * - 双方 resourceKey 相同（write 同路径 / todo 同 goal）：串行
 * - 其余组合并行（exec 无共享资源；提交顺序由调度器保证）
 * - uri 畸形：self 侧阻塞（不放行到 execute），active 侧跳过（不误伤）
 */
const postCanStart: CanStartFn = (self, active) => {
	if (active.length === 0) return true;

	const selfFacts = scheduleFactsOf(self);
	if (!selfFacts || selfFacts.exclusive) return false;

	for (const a of active) {
		const activeFacts = scheduleFactsOf(a);
		if (!activeFacts) continue;
		if (activeFacts.exclusive) return false;
		if (
			selfFacts.resourceKey !== null &&
			selfFacts.resourceKey === activeFacts.resourceKey
		) {
			return false;
		}
	}
	return true;
};

/** 从 ToolsConfig 构建 scheme 模块的统一上下文 */
function makeSchemeContext(toolsConfig: ToolsConfig): SchemeContext {
	return {
		platform: toolsConfig.platform,
		workspace: toolsConfig.workspace,
		sessionDir: toolsConfig.sessionDir,
		blocked_commands: toolsConfig.security.blocked_commands,
		default_exec_waitfor: toolsConfig.agent.default_exec_waitfor,
		max_exec_output_tokens: toolsConfig.agent.max_exec_output_tokens,
		bgSyncIntervalMs: toolsConfig.bgSyncIntervalMs,
		allowCustomer: toolsConfig.allowCustomer ?? true,
	};
}

/**
 * 构建 `post` 单 entry：传输层只做边界解析与分发，
 * scheme 语义全部委托注册表。
 */
function buildPostEntry(toolsConfig: ToolsConfig): ToolEntry {
	const ctx = makeSchemeContext(toolsConfig);

	return {
		definition: makePostToolDefinition(ctx),
		canStart: postCanStart,
		execute: async function* (tc, confirmFn) {
			const args = PostArgsSchema.parse(tc.args);

			let parsed: ParsedUri;
			try {
				parsed = parsePostUri(args.uri);
			} catch (err) {
				// 畸形/不支持的 uri 是参数错误，不是执行错误
				yield {
					type: "tool_arg_error",
					callId: tc.id,
					tool: "post",
					error: {
						kind: "invalid_args",
						issues: [
							{
								path: "uri",
								message: err instanceof Error ? err.message : String(err),
							},
						],
					},
				};
				return;
			}

			// 边界已解析；handler 收到 Parsed*，不再触碰 raw uri
			const call: PostToolCall = { id: tc.id, tool: "post", args };
			const handler = schemeFor(parsed.scheme);
			// parsePostUri 成功即 handler 存在；防御分支防御注册表自身不一致
			if (!handler) {
				yield {
					type: "tool_arg_error",
					callId: tc.id,
					tool: "post",
					error: {
						kind: "invalid_args",
						issues: [
							{
								path: "uri",
								message: `No handler for scheme "${parsed.scheme}".`,
							},
						],
					},
				};
				return;
			}
			yield* handler.execute(parsed, call, ctx, confirmFn);
		},
		recover: async (partial: PartialToolCall) => {
			const extracted = extractUriBody(partial.partialInput);
			if (!extracted) return null;
			// 恢复是第二个边界：提取的 raw uri 同样先解析再委托
			let parsed: ParsedUri;
			try {
				parsed = parsePostUri(extracted.uri);
			} catch {
				return null;
			}
			const handler = schemeFor(parsed.scheme);
			if (!handler?.recover) return null;
			return handler.recover(extracted, partial.toolCallId, ctx);
		},
	};
}

// ── Toolkit ──

export interface Toolkit {
	/** ToolDefinition 列表 — 供 client.stream() 使用 */
	tools: ToolDefinition[];
	bind(confirmFn?: (question: string) => Promise<string>): ToolkitSession;
}

/**
 * 构建完整工具集（唯一 `post` 工具）。
 *
 * @param toolsConfig 工具配置，包含 workspace、sessionDir、security 等。
 * @param model LLM 模型名称（可选，保留接口兼容）。
 */
export function makeToolkit(
	toolsConfig: ToolsConfig,
	_model?: string,
): Toolkit {
	const registry: Record<string, ToolEntry> = {
		post: buildPostEntry(toolsConfig),
	};

	// 工具顺序是隐性优先级信号——模型对前置工具有注意力偏向。
	// 唯一工具也显式声明顺序，保持与旧注册表相同的取用路径。
	const TOOL_ORDER = ["post"] as const;
	const tools = TOOL_ORDER.map((name) => registry[name]?.definition).filter(
		(t): t is ToolDefinition => t !== undefined,
	);

	const activeTools = new Set<string>(TOOL_ORDER);
	return {
		tools,
		bind: (confirmFn) => {
			const resolve = (name: string) =>
				activeTools.has(name) ? registry[name] : undefined;
			return createToolkitSession(resolve, confirmFn);
		},
	};
}

// ── Re-exports ──

export type { CanStartFn } from "@n0n/types";
export type { ToolsConfig } from "./config.ts";

export type {
	ExtractedPartial,
	PartialToolCall,
	RecoveredPair,
	ToolRecover,
	UnrecoverableCall,
} from "./recovery.ts";
export { SCHEMES } from "./schemes/index.ts";
export type { SchemeContext, SchemeHandler } from "./schemes/types.ts";
export type { ToolJob, ToolkitSession } from "./session.ts";
export type { ParsedUri } from "./uri.ts";
export { parsePostUri } from "./uri.ts";
