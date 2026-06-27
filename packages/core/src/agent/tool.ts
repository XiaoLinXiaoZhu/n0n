/**
 * 工具调用解析与执行 — agentLoop 的工具层
 */

import { REGISTERED_TOOLS, type ToolEntry } from "@n0n/tools";
import type {
	AssistantToolCallPart,
	ToolArgErrorMessage,
	ToolCallRecord,
	ToolStreamEvent,
} from "@n0n/types";
import { ExecArgsSchema, ShowArgsSchema, WriteArgsSchema } from "@n0n/types";
import { ZodError } from "zod";

/** 工具查找函数类型 — 由 Toolkit 提供 */
export type GetToolEntry = (name: string) => ToolEntry | undefined;

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
			// 执行阶段的 Zod schema 校验（executeToolStream）在入口处兜底。
		} as ToolCallRecord;
	});
}

/** 校验工具名已注册且参数解析成功 */
export function isValidToolCall(tc: ToolCallRecord): boolean {
	return REGISTERED_TOOLS.has(tc.tool) && !("_parseError" in tc.args);
}

// ── 执行 ──

export async function* executeToolStream(
	tc: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
	getEntry?: GetToolEntry,
): AsyncGenerator<ToolStreamEvent> {
	const resolve = getEntry ?? ((_name: string) => undefined);
	const entry = resolve(tc.tool);
	if (!entry) {
		yield {
			type: "tool_arg_error",
			callId: tc.id,
			tool: tc.tool,
			error: { kind: "unknown_tool" },
		} satisfies ToolArgErrorMessage;
		return;
	}

	try {
		if (entry.stream) {
			yield* entry.execute(tc, confirmFn);
		} else {
			yield await entry.execute(tc, confirmFn);
		}
	} catch (err) {
		if (err instanceof ZodError) {
			const argError: ToolArgErrorMessage = {
				type: "tool_arg_error",
				callId: tc.id,
				tool: tc.tool,
				error: {
					kind: "invalid_args",
					issues: err.issues.map((i) => ({
						path: i.path.join("."),
						message: i.message,
					})),
					schema: entry.definition?.parameters,
				},
			};
			yield argError;
			return;
		}
		throw err;
	}
}
