/**
 * Agent 结果处理 — 用户可见消息的循环控制
 *
 * 独立于主循环，便于单独测试各状态的流转行为。
 *
 * customer:// 调用总是 wait_for_customer；自然结束（纯内容、无工具调用）
 * 由主循环直接处理，不经过本模块。
 */

import { style, writeln } from "@n0n/cli-ui";
import type { CustomerCompleted } from "@n0n/types";

import type { NotifyConfig } from "../notify-sound.ts";
import { playNotifySound } from "../notify-sound.ts";

/** 结果处理后的循环控制 — customer 总是等待客户参与 */
export type HandleResultOutcome = { action: "wait_for_customer" };

/** 按 kind 渲染一条 customer 请求，通知并等待客户输入。 */
export function handleCustomerResult(
  result: CustomerCompleted,
  notifyConfig: NotifyConfig,
  notify: (config: NotifyConfig) => void = playNotifySound,
): HandleResultOutcome {
  const body = result.call.args.body;

  switch (result.kind) {
    case "question": {
      writeln(`${style.yellow("?")} 问题：${body}`);
      writeln();
      notify(notifyConfig);
      return { action: "wait_for_customer" };
    }
    case "form": {
      writeln(`${style.cyan("✎")} 请填写：${body}`);
      writeln();
      notify(notifyConfig);
      return { action: "wait_for_customer" };
    }
    case "action_required": {
      writeln(`${style.yellow("↗")} 需要操作：${body}`);
      writeln();
      notify(notifyConfig);
      return { action: "wait_for_customer" };
    }
  }
}

/**
 * 按顺序处理同一轮的多个 customer 请求。
 *
 * 每条都独立完成渲染和通知；全部返回 wait_for_customer。
 */
export function handleCustomerResults(
  results: readonly CustomerCompleted[],
  notifyConfig: NotifyConfig,
  notify: (config: NotifyConfig) => void = playNotifySound,
): HandleResultOutcome {
  if (results.length === 0) {
    throw new Error(
      "handleCustomerResults requires at least one customer result",
    );
  }

  for (const result of results) {
    handleCustomerResult(result, notifyConfig, notify);
  }
  return { action: "wait_for_customer" };
}
