/**
 * core agent 测试公共工具
 *
 * Mock ToolCallRecord / ToolResult / PipelineJob 工厂函数。
 */

import type { ToolJob } from "@n0n/tools";
import type { ToolCallRecord, ToolResult } from "@n0n/types";
import type { PipelineJob } from "../scheduler.ts";

// ── Mock ToolCallRecord 工厂 ──

export function mockExecTC(id: string, script = "echo hi"): ToolCallRecord {
	return { id, tool: "observe", args: { script } } as ToolCallRecord;
}

export function mockWriteTC(id: string, path: string): ToolCallRecord {
	return {
		id,
		tool: "write",
		args: { path, content: "test" },
	} as ToolCallRecord;
}

export function mockPathExclusiveTC(id: string, path: string): ToolCallRecord {
	return {
		id,
		tool: "write",
		args: { path, content: "test" },
	} as ToolCallRecord;
}

export function mockShowTC(id: string): ToolCallRecord {
	return {
		id,
		tool: "show",
		args: { type: "qualified delivery", content: "test" },
	} as ToolCallRecord;
}

// ── Mock ToolResult 工厂 ──

/** 通用 mock result（最小字段，用于调度器测试） */
export function mockResult(tc: ToolCallRecord): ToolResult {
	return {
		type: "tool_result",
		tool: tc.tool,
		call: tc,
		success: true,
		error: null,
	} as unknown as ToolResult;
}

/** exec 专用 mock result（完整字段，用于 round 测试） */
export function mockExecResult(tc: ToolCallRecord): ToolResult {
	return {
		type: "tool_result",
		tool: "observe",
		call: tc,
		status: "completed",
		exitCode: 0,
		stdout: "output",
		stderr: "",
		durationMs: 100,
	} as ToolResult;
}

// ── Mock PipelineJob 工厂 ──

export function mockCompletedJob(
	tc: ToolCallRecord,
	result: ToolResult,
): PipelineJob {
	const job: ToolJob = {
		call: tc,
		canStart: () => true,
		run: async function* () {
			yield result;
		},
	};
	return {
		status: "completed",
		job,
		result,
	};
}

// biome-ignore lint/suspicious/noExplicitAny: test mock flexibility
export function mockFailedJob(tc: ToolCallRecord, argError: any): PipelineJob {
	const job: ToolJob = {
		call: tc,
		canStart: () => true,
		run: async function* () {},
	};
	return {
		status: "failed",
		job,
		argError,
	};
}
