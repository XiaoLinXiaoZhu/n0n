/**
 * Show 工具结果类型
 */

import type { MakeResultBase } from "./registry.ts";

export type ShowToolResult = MakeResultBase<"show"> & {
	/** show 的结果值（等于 call.args，由 schema 后验证） */
	cleanedResult: unknown;
};
