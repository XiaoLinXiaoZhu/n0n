/**
 * 工具类型聚合模块
 */

// post 参数（tool-args.ts，注册表引用的 args 类型）
export type { PostArgs } from "../../tool-args.ts";
// Customer (post 的 customer:// 后端)
export type { CustomerCompleted, CustomerKind } from "./customer.ts";
// Exec (post 的 exec:// 后端)
export type {
  ExecBackgrounded,
  ExecCompleted,
  ExecToolResult,
  ExecTruncated,
  ExecutionArtifactRef,
} from "./exec.ts";
// 注册表核心
export type {
  MakeCall,
  MakeResult,
  MakeResultBase,
  PartialToolCallRecord,
  PostToolCall,
  ToolCallRecord,
  ToolCallRecordMap,
  ToolMap,
  ToolName,
} from "./registry.ts";
// Todo (post 的 todo:// 后端)
export type { TodoCompleted, TodoRecovered, TodoToolResult } from "./todo.ts";
// Write (post 的 write:// 后端)
export type {
  WriteCompleted,
  WriteFailed,
  WriteRecovered,
  WriteRecoverFailed,
  WriteToolResult,
} from "./write.ts";

// ── 聚合 ToolResult 联合 ──

import type { CustomerCompleted } from "./customer.ts";
import type { ExecToolResult } from "./exec.ts";
import type { TodoToolResult } from "./todo.ts";
import type { WriteToolResult } from "./write.ts";

/**
 * 工具结果联合 — 全部携带 tool: "post"，
 * 以 scheme 字面量（exec | write | customer | todo）区分后端，再以 status 细分。
 */
export type ToolResult =
  ExecToolResult | WriteToolResult | CustomerCompleted | TodoToolResult;

// ── 工具执行结局 ──

import type { ToolArgErrorMessage } from "../errors.ts";

/**
 * 工具执行结局 — scheduler 向消费者报告单个工具执行完成时的判别联合。
 * completed: 正常执行完毕，携带结果。
 * arg_error: 参数解析失败，无结果。
 */
export type ToolExecOutcome =
  { status: "completed"; result: ToolResult } | { status: "arg_error" };

/** 工具执行过程中的流式输出 chunk */
export interface ToolOutputChunk {
  type: "tool_output_chunk";
  callId: string;
  tool: string;
  chunk: string;
}

/** 工具流式执行产出：chunk 或最终结果 */
export type ToolStreamEvent =
  ToolOutputChunk | ToolResult | ToolArgErrorMessage;
