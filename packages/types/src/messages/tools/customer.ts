/**
 * customer 工具结果类型 — 由 `post` 的 customer:// 后端产出
 *
 * customer 调用总是中断循环并等待用户，成功或参数错误之外没有中间状态，
 * 因此只有一种完成形态。kind 是 customer:// 后的路径段。
 */

import type { MakeResult } from "./registry.ts";

export type CustomerKind = "question" | "form" | "action_required";

export interface CustomerCompleted extends MakeResult<"post", "completed"> {
	scheme: "customer";
	kind: CustomerKind;
}
