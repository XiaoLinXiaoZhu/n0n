/**
 * idle_nudge 格式化 — 含 anti-few-shot 变体
 *
 * 连续的相同空转警告反而会强化"不用工具"的模式，
 * 变体措辞打破这种 few-shot 陷阱。
 *
 * 所有模板一致引导使用 show(final report)：
 * 空转状态下任务已结束，唯一正确的动作是完成汇报，
 * 而不是继续用 show(working log) 拖下去。
 */

import type { IdleNudgeMessage } from "@n0n/types";
import type { TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const templates = [
	(idle: number, max: number) =>
		`Your previous response was not delivered to the user — only show results reach them. If you had content they should see, submit it via show(final report). Idle ${idle}/${max}.`,
	(idle: number, max: number) =>
		`The user did not see your last text output. If it contained information meant for them, submit it via show(final report) instead of discarding it. Idle count: ${idle}/${max}.`,
	(idle: number, max: number) =>
		`Plain text replies are invisible to the user. If you drafted a response they should read, put it in a show(final report) call — that's the only channel that reaches them. (${idle}/${max} idle rounds)`,
];

export function formatIdleNudge(
	msg: IdleNudgeMessage,
	tags: TagAdapter,
	msgIndex: number,
): string {
	const tpl = pick(templates, msgIndex);
	return tags.wrapTag("system_warning", tpl(msg.idleCount, msg.maxIdleRounds));
}
