/**
 * idle_nudge 格式化 — 含 anti-few-shot 变体
 *
 * 连续的相同空转警告反而会强化"不用工具"的模式，
 * 变体措辞打破这种 few-shot 陷阱。
 *
 * 所有模板一致引导使用与客户任务或质量终态匹配的 show type。
 */

import type { IdleNudgeMessage } from "@n0n/types";
import type { TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const templates = [
	(idle: number, max: number) =>
		`Your previous response was not delivered to the user — only show results reach them. Submit it through show using the type that matches the customer's next task or the actual quality terminal state. Idle ${idle}/${max}.`,
	(idle: number, max: number) =>
		`The user did not see your last text output. If it contained information meant for them, submit it through show with the correct customer-task or quality-terminal type. Idle count: ${idle}/${max}.`,
	(idle: number, max: number) =>
		`Plain text replies are invisible to the user. Put user-facing content in show and select the type from the real next action or terminal state. (${idle}/${max} idle rounds)`,
];

export function formatIdleNudge(
	msg: IdleNudgeMessage,
	tags: TagAdapter,
	msgIndex: number,
): string {
	const tpl = pick(templates, msgIndex);
	return tags.wrapTag("system_warning", tpl(msg.idleCount, msg.maxIdleRounds));
}
