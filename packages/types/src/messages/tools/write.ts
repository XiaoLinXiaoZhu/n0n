/**
 * file 工具结果类型 — 由 `post` 的 write:// 后端产出
 *
 * 结果携带 scheme 判别字段（"write"），在 ToolResult 联合中区分后端；
 * path 由 executor 解析 uri 后写入，供 formatter 与 renderer 使用，
 * 避免重复解析。
 */

import type { MakeResult } from "./registry.ts";

/** file 后端结果的公共字段 */
interface FileResultBase extends MakeResult<"post", string> {
  scheme: "write";
  /** 已解析的目标文件路径（与写入路径一致） */
  path: string;
}

/**
 * 本次写入的行变化统计（落盘内容相对磁盘上的原内容）。
 *
 * `added`/`removed` 由最长公共子序列唯一确定（`|new| - LCS`、`|old| - LCS`）
 * ——同一对内容永远得到同一组数字，与具体 diff 实现无关；代价是变更区过大
 * 时无法在预算内精确求解，此时 `exact = false`，两个数字退化为变更区行数
 * 上界。
 */
export interface WriteStats {
  /** 新增行数 */
  added: number;
  /** 删除行数 */
  removed: number;
  /** false = 变更区超过精确 diff 上限，数字为变更区行数上界 */
  exact: boolean;
}

/** file 正常写入成功 */
export interface WriteCompleted extends FileResultBase {
  status: "completed";
  /** 行变化统计；缺省表示该实现未统计 */
  stats?: WriteStats;
}

/** file 写入失败 */
export interface WriteFailed extends FileResultBase {
  status: "failed";
  error: string;
}

/** file 从截断恢复后写入成功（内容不完整） */
export interface WriteRecovered extends FileResultBase {
  status: "recovered";
  /** 行变化统计；缺省表示该实现未统计 */
  stats?: WriteStats;
}

/** file 从截断恢复失败（参数无法解析） */
export interface WriteRecoverFailed extends FileResultBase {
  status: "recover_failed";
  error: string;
}

export type WriteToolResult =
  WriteCompleted | WriteFailed | WriteRecovered | WriteRecoverFailed;
