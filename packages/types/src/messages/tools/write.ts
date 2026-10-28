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

/** file 正常写入成功 */
export interface WriteCompleted extends FileResultBase {
	status: "completed";
}

/** file 写入失败 */
export interface WriteFailed extends FileResultBase {
	status: "failed";
	error: string;
}

/** file 从截断恢复后写入成功（内容不完整） */
export interface WriteRecovered extends FileResultBase {
	status: "recovered";
}

/** file 从截断恢复失败（参数无法解析） */
export interface WriteRecoverFailed extends FileResultBase {
	status: "recover_failed";
	error: string;
}

export type WriteToolResult =
	| WriteCompleted
	| WriteFailed
	| WriteRecovered
	| WriteRecoverFailed;
