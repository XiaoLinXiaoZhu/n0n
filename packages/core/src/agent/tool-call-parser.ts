import type { AssistantToolCallPart, ToolCallRecord } from "@n0n/types";
import { ExecArgsSchema, ShowArgsSchema, WriteArgsSchema } from "@n0n/types";

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
		} as ToolCallRecord;
	});
}
