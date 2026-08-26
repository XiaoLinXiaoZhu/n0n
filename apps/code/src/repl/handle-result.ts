/**
 * Agent 结果处理 — 用户可见消息的循环控制
 *
 * 独立于主循环，便于单独测试各状态的流转行为。
 */

import { style, writeln } from "@n0n/cli-ui";
import { parseDsl } from "@n0n/shared";
import type { DomainMessage } from "@n0n/types";
import type { NotifyConfig } from "../notify-sound.ts";
import { playNotifySound } from "../notify-sound.ts";
import { PRODUCTION_RECORD_NUDGE_TEXT } from "../production-record-nudge.ts";
import type { CodeShowResult } from "../schema.ts";
import type { ShowWriter } from "../show-writer.ts";

/** 结果处理后的循环控制 */
export type HandleResultOutcome =
	| { action: "wait_for_customer" }
	| { action: "auto_resume"; historyEntry: DomainMessage }
	| { action: "terminal" };

function makeUserInput(content: string, hint?: string | null): DomainMessage {
	return {
		type: "user_input",
		content,
		context: null,
		hint: hint ?? null,
		mentionedSkills: [],
	};
}

/**
 * 根据 agent 返回的 show 结果决定下一步循环行为。
 */
export function handleShowResult(
	ir: CodeShowResult,
	showWriter: ShowWriter,
	notifyConfig: NotifyConfig,
	notify: (config: NotifyConfig) => void = playNotifySound,
): HandleResultOutcome {
	showWriter.write(ir);

	switch (ir.type) {
		case "customer information required": {
			writeln(`${style.yellow("?")} 需要客户信息: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "wait_for_customer" };
		}
		case "customer decision required": {
			writeln(`${style.yellow("?")} 需要客户决定: ${ir.content}`);
			writeln();
			const blockItems = parseDsl(ir.content);
			for (const [i, item] of blockItems.entries()) {
				writeln(`  ${style.cyan(`${i + 1})`)} ${item.label}`);
				if (item.detail) {
					writeln(`     ${style.gray(item.detail)}`);
				}
			}
			writeln();
			notify(notifyConfig);
			return { action: "wait_for_customer" };
		}
		case "customer action required": {
			writeln(`${style.yellow("↗")} 需要客户操作: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "wait_for_customer" };
		}
		case "production record": {
			writeln(`${style.cyan("⏳")} 生产记录: ${ir.content}`);
			writeln();
			return {
				action: "auto_resume",
				historyEntry: makeUserInput("", PRODUCTION_RECORD_NUDGE_TEXT),
			};
		}
		case "qualified delivery": {
			writeln(`${style.green("✓")} 合格交付: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "terminal" };
		}
		case "production suspended": {
			writeln(`${style.yellow("!")} 生产暂停: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "terminal" };
		}
		case "production failed": {
			writeln(`${style.red("✗")} 生产失败: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "terminal" };
		}
		case "customer cancelled": {
			writeln(`${style.gray("■")} 客户取消: ${ir.content}`);
			writeln();
			notify(notifyConfig);
			return { action: "terminal" };
		}
	}
}
