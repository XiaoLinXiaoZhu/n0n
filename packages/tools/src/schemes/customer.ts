/**
 * customer scheme — 向客户提问/请求填写/请求操作
 *
 * body 是发给客户的消息正文。产出 CustomerCompleted 结果并中断 agent 循环，
 * 由消费层（repl/headless）渲染后等待客户响应。
 *
 * 调度事实：独占（打断循环，不得与任何调用并行）。
 * 恢复能力：无（消息被截断则不可恢复）。
 * 可见性：describe 在 allowCustomer=false 时返回空数组（headless 模式隐藏），
 * execute 同时以 arg-error 拒绝——描述层与执行层双重把关。
 */

import type { CustomerCompleted, CustomerKind } from "@n0n/types";
import { decodeSegment } from "./parse-utils.ts";
import type { SchemeHandler } from "./types.ts";

/** customer:// 的解析产物 */
export interface ParsedCustomer {
	scheme: "customer";
	kind: CustomerKind;
}

const CUSTOMER_KINDS: readonly CustomerKind[] = [
	"question",
	"form",
	"action_required",
];

export const customerScheme: SchemeHandler<ParsedCustomer> = {
	scheme: "customer",
	uriPrefix: "customer://",
	bodyHint: "the message text for customer://",
	exclusive: true,

	describe(ctx) {
		if (!ctx.allowCustomer) return [];
		return [
			"customer — customer://question | customer://form | customer://action_required . Body is the message to the customer. This interrupts the agent loop and waits for the customer to respond. question is a multiple-choice question with a recommended pick; form requests specific information; action_required is something the customer must do.",
		];
	},

	parse(rest, fullUri) {
		// customer:// 之后全部是 kind，必须精确匹配
		const kindPart = decodeSegment(rest);
		const kind = CUSTOMER_KINDS.find((k) => k === kindPart);
		if (!kind) {
			throw new Error(
				`Malformed customer uri "${fullUri}". Expected one of: ${CUSTOMER_KINDS.join(", ")}.`,
			);
		}
		return { scheme: "customer", kind };
	},

	async *execute(parsed, call, ctx) {
		if (ctx.allowCustomer === false) {
			yield {
				type: "tool_arg_error",
				callId: call.id,
				tool: "post",
				error: {
					kind: "invalid_args",
					issues: [
						{
							path: "uri",
							message: "customer:// is not available in this mode.",
						},
					],
				},
			};
			return;
		}
		const result: CustomerCompleted = {
			type: "tool_result",
			tool: "post",
			call,
			status: "completed",
			scheme: "customer",
			kind: parsed.kind,
		};
		yield result;
	},
};
