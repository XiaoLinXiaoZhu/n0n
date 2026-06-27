/**
 * 工具类型聚合模块
 */

// Exec (shared by observe / reason / act)
export type {
	ExecBackgrounded,
	ExecCompleted,
	ExecToolName,
	ExecToolResult,
	ExecTruncated,
} from "./exec.ts";
// Show
export type { ShowToolResult } from "./progress.ts";
// 注册表核心
export type {
	ActToolCall,
	MakeCall,
	MakeResult,
	MakeResultBase,
	ObserveToolCall,
	PartialToolCallRecord,
	ReasonToolCall,
	ShowToolCall,
	ToolCallRecord,
	ToolCallRecordMap,
	ToolMap,
	ToolName,
	WriteToolCall,
} from "./registry.ts";
// Write
export type {
	WriteCompleted,
	WriteFailed,
	WriteRecovered,
	WriteRecoverFailed,
	WriteToolResult,
} from "./write.ts";

// ── 聚合 ToolResult 联合 ──

import type { ExecToolResult } from "./exec.ts";
import type { ShowToolResult } from "./progress.ts";
import type { WriteToolResult } from "./write.ts";

export type ToolResult = ExecToolResult | WriteToolResult | ShowToolResult;

// ── 工具执行结局 ──

import type { ToolArgErrorMessage } from "../errors.ts";

/**
 * 工具执行结局 — scheduler 向消费者报告单个工具执行完成时的判别联合。
 * completed: 正常执行完毕，携带结果。
 * arg_error: 参数解析失败，无结果。
 */
export type ToolExecOutcome =
	| { status: "completed"; result: ToolResult }
	| { status: "arg_error" };

/** 工具执行过程中的流式输出 chunk */
export interface ToolOutputChunk {
	type: "tool_output_chunk";
	callId: string;
	tool: string;
	chunk: string;
}

/** 工具流式执行产出：chunk 或最终结果 */
export type ToolStreamEvent =
	| ToolOutputChunk
	| ToolResult
	| ToolArgErrorMessage;
