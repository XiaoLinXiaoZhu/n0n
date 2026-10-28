/**
 * core agent 测试公共工具
 *
 * Mock ToolCallRecord / ToolResult / PipelineJob 工厂函数。
 * 唯一工具为 `post`，后端由 uri scheme 路由（exec:// / write:// / customer://）。
 */

import type { ToolJob } from "@n0n/tools";
import type {
	CustomerKind,
	ToolArgErrorMessage,
	ToolCallRecord,
	ToolResult,
} from "@n0n/types";
import type { PipelineJob } from "../scheduler.ts";

// ── Mock ToolCallRecord 工厂 ──

export function mockExecTC(id: string, body = "echo hi"): ToolCallRecord {
	return {
		id,
		tool: "post",
		args: { uri: "exec://sh/probe", body },
	} as ToolCallRecord;
}

export function mockWriteTC(id: string, path: string): ToolCallRecord {
	return {
		id,
		tool: "post",
		args: { uri: `write://${path}`, body: "test" },
	} as ToolCallRecord;
}

export function mockPathExclusiveTC(id: string, path: string): ToolCallRecord {
	return mockWriteTC(id, path);
}

export function mockCustomerTC(
	id: string,
	kind: CustomerKind = "question",
): ToolCallRecord {
	return {
		id,
		tool: "post",
		args: { uri: `customer://${kind}`, body: "test" },
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
		tool: "post",
		call: tc,
		status: "completed",
		scheme: "exec",
		claim: "probe",
		runtime: "sh",
		cwd: "/tmp",
		exitCode: 0,
		stdout: "output",
		stderr: "",
		durationMs: 100,
	} as unknown as ToolResult;
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

export function mockFailedJob(
	tc: ToolCallRecord,
	argError: ToolArgErrorMessage,
): PipelineJob {
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
