/**
 * handleCustomerResults — 同一轮多个 customer 请求的顺序渲染与循环控制。
 */

import { describe, expect, test } from "bun:test";
import type { CustomerCompleted } from "@n0n/types";
import type { NotifyConfig } from "../notify-sound.ts";
import { handleCustomerResults } from "../repl/handle-customer.ts";

const notifyConfig: NotifyConfig = { enabled: false };

function makeCustomer(
	kind: CustomerCompleted["kind"],
	body: string,
): CustomerCompleted {
	return {
		type: "tool_result",
		tool: "post",
		status: "completed",
		scheme: "customer",
		kind,
		call: {
			id: `call-${kind}-${Math.random().toString(36).slice(2)}`,
			tool: "post",
			args: { uri: `customer://${kind}`, body },
		},
	};
}

function run(results: CustomerCompleted[]) {
	let notifications = 0;
	const outcome = handleCustomerResults(results, notifyConfig, () => {
		notifications++;
	});
	return { outcome, notifications };
}

describe("handleCustomerResults", () => {
	test("question 渲染并通知，返回 wait_for_customer", () => {
		const { outcome, notifications } = run([
			makeCustomer("question", "选 A 还是 B？\n推荐 A"),
		]);
		expect(outcome.action).toBe("wait_for_customer");
		expect(notifications).toBe(1);
	});

	test("form 渲染并通知，返回 wait_for_customer", () => {
		const { outcome, notifications } = run([
			makeCustomer("form", "姓名：\n邮箱："),
		]);
		expect(outcome.action).toBe("wait_for_customer");
		expect(notifications).toBe(1);
	});

	test("action_required 渲染并通知，返回 wait_for_customer", () => {
		const { outcome, notifications } = run([
			makeCustomer("action_required", "请确认部署"),
		]);
		expect(outcome.action).toBe("wait_for_customer");
		expect(notifications).toBe(1);
	});

	test("多个 customer 结果逐条渲染并通知", () => {
		const { outcome, notifications } = run([
			makeCustomer("question", "第一个问题"),
			makeCustomer("action_required", "第一个操作"),
		]);
		expect(outcome.action).toBe("wait_for_customer");
		expect(notifications).toBe(2);
	});

	test("空结果抛出错误", () => {
		expect(() => run([])).toThrow(
			"handleCustomerResults requires at least one customer result",
		);
	});
});
