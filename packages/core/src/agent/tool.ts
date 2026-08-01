/**
 * 工具调用解析与执行 — agentLoop 的工具层
 */

import type { ToolEntry, Toolkit } from "@n0n/tools";
import type {
	AssistantToolCallPart,
	ToolArgErrorMessage,
	ToolCallRecord,
	ToolStreamEvent,
} from "@n0n/types";
import { ExecArgsSchema, ShowArgsSchema, WriteArgsSchema } from "@n0n/types";
import { ZodError } from "zod";
import {
	makeUnrecoverablePair,
	type PartialToolCall,
	type RecoveredPair,
} from "./tool-recovery.ts";

/** Agent 运行时使用的统一工具接缝。 */
export interface ToolRuntime {
	execute(tc: ToolCallRecord): AsyncGenerator<ToolStreamEvent>;
	recover(partial: PartialToolCall): Promise<RecoveredPair>;
}

// ── 参数键序归一化 ──

/** 工具名 → 规范参数键序 */
const PARAM_ORDER_MAP: Record<string, string[]> = {
	exec: Object.keys(ExecArgsSchema.shape),
	observe: Object.keys(ExecArgsSchema.shape),
	reason: Object.keys(ExecArgsSchema.shape),
	act: Object.keys(ExecArgsSchema.shape),
	write: Object.keys(WriteArgsSchema.shape),
	show: Object.keys(ShowArgsSchema.shape),
};

/** 将 args 的键序调整为规范顺序（不在规范中的键追加在末尾） */
function normalizeArgOrder(
	args: Record<string, unknown>,
	toolName: string,
): Record<string, unknown> {
	const order = PARAM_ORDER_MAP[toolName];
	if (!order) return args;

	const normalized: Record<string, unknown> = {};
	for (const key of order) {
		if (key in args) {
			normalized[key] = args[key];
		}
	}
	// 补充规范中未出现的键
	for (const key of Object.keys(args)) {
		if (!(key in normalized)) {
			normalized[key] = args[key];
		}
	}
	return normalized;
}

/** parse：将 unknown 收窄为 Record<string, unknown>，非 plain object 时抛错 */
function parseRecord(v: unknown): Record<string, unknown> {
	if (v === null || typeof v !== "object" || Array.isArray(v)) {
		throw new Error("expected a plain object");
	}
	return v as Record<string, unknown>;
}

// ── 解析 ──

/**
 * tool calls → 领域 ToolCallRecord。
 *
 * 接受 { toolCallId, toolName, input } 格式，
 * 解析阶段只做 JSON.parse 及参数键序归一化，
 * 参数结构由执行阶段的 Zod schema 校验。
 */
export function parseToolCalls(raw: AssistantToolCallPart[]): ToolCallRecord[] {
	return raw.map((tc) => {
		let args: Record<string, unknown>;
		try {
			const parsed =
				typeof tc.input === "string" ? JSON.parse(tc.input) : tc.input;
			const record = parseRecord(parsed);
			args = normalizeArgOrder(record, tc.toolName);
		} catch {
			args = { _parseError: true, _raw: tc.input };
		}
		return {
			id: tc.toolCallId,
			tool: tc.toolName,
			args,
			// NOTE: tool 是运行时 string，无法在 parse 阶段收窄为字面量联合。
			// 执行阶段的 ToolRuntime 会在入口处完成工具查找和 schema 校验。
		} as ToolCallRecord;
	});
}

// ── 执行 ──

function unknownToolError(tc: ToolCallRecord): ToolArgErrorMessage {
	return {
		type: "tool_arg_error",
		callId: tc.id,
		tool: tc.tool,
		error: { kind: "unknown_tool" },
	};
}

function invalidArgsError(
	tc: ToolCallRecord,
	entry: ToolEntry,
	err: ZodError,
): ToolArgErrorMessage {
	return {
		type: "tool_arg_error",
		callId: tc.id,
		tool: tc.tool,
		error: {
			kind: "invalid_args",
			issues: err.issues.map((i) => ({
				path: i.path.join("."),
				message: i.message,
			})),
			schema: entry.definition.parameters,
		},
	};
}

async function* executeEntry(
	entry: ToolEntry,
	tc: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
): AsyncGenerator<ToolStreamEvent> {
	try {
		yield* entry.execute(tc, confirmFn);
	} catch (err) {
		if (err instanceof ZodError) {
			yield invalidArgsError(tc, entry, err);
			return;
		}
		throw err;
	}
}

async function recoverPartial(
	toolkit: Toolkit,
	partial: PartialToolCall,
): Promise<RecoveredPair> {
	const entry = toolkit.getEntry(partial.toolName);
	if (!entry) {
		return makeUnrecoverablePair(partial, "unknown_tool");
	}

	try {
		const recovered = await entry.recoverAndExecute?.(
			partial.toolCallId,
			partial.partialInput,
		);
		if (recovered) {
			return { status: "recovered", ...recovered };
		}
	} catch {
		// recoverAndExecute 抛异常视同恢复失败。
	}

	return makeUnrecoverablePair(partial, "truncated_recovery");
}

export function createToolRuntime(
	toolkit: Toolkit,
	confirmFn?: (question: string) => Promise<string>,
): ToolRuntime {
	return {
		execute: async function* (tc) {
			const entry = toolkit.getEntry(tc.tool);
			if (!entry) {
				yield unknownToolError(tc);
				return;
			}
			yield* executeEntry(entry, tc, confirmFn);
		},
		recover: (partial) => recoverPartial(toolkit, partial),
	};
}
