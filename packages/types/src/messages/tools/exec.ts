/**
 * Exec 工具结果类型 — 由 observe / reason / act 三个工具共享
 *
 * 三个工具共用完全相同的参数结构（ExecArgs）和执行后端（execToolStream），
 * 差异仅在工具名和 description。
 * result.tool 携带实际调用的工具名，用于 formatter 和 renderer 的围栏信号。
 */

import type { MakeResult } from "./registry.ts";

/** 共享此结果类型的工具名集合 */
export type ExecToolName = "observe" | "reason" | "act";

export interface ExecutionArtifactRef {
	kind: "execution";
	version: 1;
	runId: string;
	runDir: string;
	stdoutFile: string;
	stderrFile: string;
	resultFile: string;
}

/** 正常完成，输出在阈值内 */
export interface ExecCompleted extends MakeResult<ExecToolName, "completed"> {
	exitCode: number;
	stdout: string;
	stderr: string;
	durationMs: number;
}

/** 正常完成，输出超长被截断并写入文件 */
export interface ExecTruncated extends MakeResult<ExecToolName, "truncated"> {
	exitCode: number;
	/** stdout 末尾截断内容 */
	stdoutTail: string;
	/** stderr 末尾截断内容 */
	stderrTail: string;
	/** 完整输出文件路径 */
	artifact: ExecutionArtifactRef;
	/** 原始 stdout 总字符数 */
	stdoutLength: number;
	/** 原始 stderr 总字符数 */
	stderrLength: number;
	/** 原始输出总行数（stdout + stderr） */
	totalLines: number;
	/** 截断展示内容起始行号（从第几行开始展示） */
	tailStartLine: number;
	durationMs: number;
}

/** 等待超限，进程转入后台继续执行 */
export interface ExecBackgrounded
	extends MakeResult<ExecToolName, "backgrounded"> {
	/** 后台进程 PID */
	pid: number;
	/** 持续更新的执行产物 */
	artifact: ExecutionArtifactRef;
	/** 超时前已捕获的 stdout */
	stdoutSoFar: string;
	/** 超时前已捕获的 stderr */
	stderrSoFar: string;
	durationMs: number;
}

export type ExecToolResult = ExecCompleted | ExecTruncated | ExecBackgrounded;
