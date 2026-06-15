/**
 * deepseek-test-1 消息预处理
 *
 * splitSkillsToUser: system_with_skill → system + user（含 skill 文本）
 * stripReasoningFromPromptMessages: 清除 progress tool 之前的 reasoning
 */

import { formatSkills } from "@n0n/shared";
import type { DomainMessage, PromptMessage, TagAdapter } from "@n0n/types";
import triggerPromptRaw from "./trigger-prompt.md" with { type: "text" };

export const triggerPromptContent = triggerPromptRaw
	.replace(/<!--[\s\S]*?-->/g, "")
	.trim();

/**
 * 把 system_with_skill 改写为：
 * - 一条纯文本 system 消息（仅 content，丢弃 skill）
 * - 紧随其后插入一条 user 消息（触发 prompt + 全部 skill 文本）
 *
 * 普通 system / 其他消息原样保留。skills 为空时不注入 user 消息。
 */
export function splitSkillsToUser(
	messages: DomainMessage[],
	tags: TagAdapter,
): DomainMessage[] {
	const out: DomainMessage[] = [];
	for (const msg of messages) {
		if (msg.type === "system_with_skill") {
			out.push({ type: "system", content: msg.content });
			if (msg.skills.length > 0) {
				const skillsText = formatSkills(msg.skills, tags);
				const body = triggerPromptContent
					? `${triggerPromptContent}\n\n${skillsText}`
					: skillsText;
				out.push({ type: "generic_user_text", content: body });
			}
		} else {
			out.push(msg);
		}
	}
	return out;
}

/**
 * 找到最后一个 toolName==="progress" 的消息索引，清空该索引之前（含）
 * 所有 assistant 消息的 reasoning 字段。
 *
 * @returns `{ messages, lastProgressIdx }` — `lastProgressIdx` 为最后一个
 * progress 的索引（-1 表示未找到），`messages` 为处理后的消息列表。
 */
export function stripReasoningFromPromptMessages(
	promptMessages: PromptMessage[],
): { messages: PromptMessage[]; lastProgressIdx: number } {
	let lastProgressIdx = -1;
	for (let i = 0; i < promptMessages.length; i++) {
		const msg = promptMessages[i];
		if (!msg) continue;
		if (
			msg.role === "tool" &&
			"toolName" in msg &&
			msg.toolName === "progress"
		) {
			lastProgressIdx = i;
		}
	}
	if (lastProgressIdx === -1)
		return { messages: promptMessages, lastProgressIdx: -1 };

	return {
		messages: promptMessages.map((msg, idx) => {
			if (idx <= lastProgressIdx && msg.role === "assistant" && msg.reasoning) {
				return { ...msg, reasoning: undefined };
			}
			return msg;
		}),
		lastProgressIdx,
	};
}
