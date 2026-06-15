/**
 * Agent 结果处理 — completed/working/blocked 三种状态的响应逻辑
 *
 * 独立于主循环，便于单独测试各状态的流转行为。
 */

import { style, writeln } from "@n0n/cli-ui";
import { parseDsl } from "@n0n/shared";
import type { DomainMessage } from "@n0n/types";
import type { NotifyConfig } from "../notify-sound.ts";
import { playNotifySound } from "../notify-sound.ts";
import type { ProgressWriter } from "../progress-writer.ts";
import type { CodeProgressResult } from "../schema.ts";
import { WORKING_NUDGE_TEXT } from "../working-nudge.ts";

/** 结果处理后的循环控制 */
export type HandleResultOutcome =
	| { action: "prompt"; userInput: string }
	| { action: "auto_resume"; historyEntry: DomainMessage }
	| { action: "continue" };

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
 * 根据 agent 返回的 progress 结果决定下一步循环行为。
 */
export function handleProgressResult(
	ir: CodeProgressResult,
	history: DomainMessage[],
	progressWriter: ProgressWriter,
	notifyConfig: NotifyConfig,
): HandleResultOutcome {
	progressWriter.write(ir);

	switch (ir.status) {
		case "blocked": {
			writeln(`${style.yellow("?")} ${ir.content}`);
			writeln();
			const blockItems = parseDsl(ir.content);
			for (const [i, item] of blockItems.entries()) {
				writeln(`  ${style.cyan(`${i + 1})`)} ${item.label}`);
				if (item.detail) {
					writeln(`     ${style.gray(item.detail)}`);
				}
			}
			writeln();
			playNotifySound(notifyConfig);
			return { action: "prompt", userInput: "" };
		}
		case "working": {
			writeln(`${style.cyan("⏳")} 进行中: ${ir.content}`);
			writeln();
			history.push(makeUserInput("", WORKING_NUDGE_TEXT));
			return {
				action: "auto_resume",
				historyEntry: makeUserInput("", WORKING_NUDGE_TEXT),
			};
		}
		case "completed": {
			writeln(`${style.green("✓")} 完成: ${ir.content}`);
			writeln();
			playNotifySound(notifyConfig);
			return { action: "prompt", userInput: "" };
		}
		default: {
			const _exhaustive: never = ir.status;
			return { action: "continue" };
		}
	}
}
