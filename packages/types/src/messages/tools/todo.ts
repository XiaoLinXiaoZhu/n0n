import type { MakeResult } from "./registry.ts";

/** todo 后端结果的公共字段 */
interface TodoResultBase extends MakeResult<"post", string> {
  scheme: "todo";
  /** uri 中的 goal 段（URL 解码后），作为 todo 文件名 */
  goal: string;
  /** 已解析的绝对持久化路径（<sessionDir>/todo/<goal>.md） */
  path: string;
}

/** todo 正常写入成功 */
export interface TodoCompleted extends TodoResultBase {
  status: "completed";
}

/** todo 从截断恢复后写入成功（内容不完整） */
export interface TodoRecovered extends TodoResultBase {
  status: "recovered";
}

export type TodoToolResult = TodoCompleted | TodoRecovered;
