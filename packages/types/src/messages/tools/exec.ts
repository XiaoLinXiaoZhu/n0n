/**
 * exec 工具结果类型 — 由 `post` 的 exec:// 后端产出
 *
 * 结果携带 scheme 判别字段（"exec"），在 ToolResult 联合中区分后端；
 * claim 是 uri 中的 NAME 路径段（模型自述当前步骤），供 formatter 与
 * renderer 替代旧的工具名标签。runtime / cwd 由 executor 解析后写入，
 * 避免 formatter 重复解析 uri。
 */

import type { MakeResult } from "./registry.ts";

export interface ExecutionArtifactRef {
  kind: "execution";
  version: 1;
  runId: string;
  runDir: string;
  stdoutFile: string;
  stderrFile: string;
  resultFile: string;
}

/** exec 后端结果的公共字段 */
interface ExecResultBase extends MakeResult<"post", string> {
  scheme: "exec";
  /** uri 中的 NAME 路径段（URL 解码后） */
  claim: string;
  /** 实际使用的 runtime（默认值已解析） */
  runtime: string;
  /** 实际使用的绝对工作目录 */
  cwd: string;
}

/** 正常完成，输出在阈值内 */
export interface ExecCompleted extends ExecResultBase {
  status: "completed";
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

/** 正常完成，输出超长被截断并写入文件 */
export interface ExecTruncated extends ExecResultBase {
  status: "truncated";
  exitCode: number;
  /** stdout 在分配预算内的头尾预览 */
  stdoutPreview: string;
  /** stderr 在分配预算内的头尾预览 */
  stderrPreview: string;
  /** 完整输出文件路径 */
  artifact: ExecutionArtifactRef;
  /** 原始 stdout 总字符数 */
  stdoutLength: number;
  /** 原始 stderr 总字符数 */
  stderrLength: number;
  stdoutLines: number;
  stderrLines: number;
  /** 本次调用要求的模型输出预算 */
  outputTokenBudget: number;
  stdoutEstimatedTokens: number;
  stderrEstimatedTokens: number;
  totalEstimatedTokens: number;
  durationMs: number;
}

/** 等待超限，进程转入后台继续执行 */
export interface ExecBackgrounded extends ExecResultBase {
  status: "backgrounded";
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
