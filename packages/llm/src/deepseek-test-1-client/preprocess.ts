/**
 * deepseek-test-1 消息预处理
 *
 * splitSkillsToUser: system_with_skill → system + user（含 skill 文本）
 * stripReasoningFromPromptMessages: 清除 show tool 之前的 reasoning
 */

import { formatSkills } from "@n0n/format-prompt";
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
 * 原因：DeepSeek-test-1 的 skill 信息通过特殊的 user 消息结构注入，
 * 与通用注入流不兼容。
 */
export function splitSkillsToUser(
	messages: DomainMessage[],
	tags: TagAdapter,
): DomainMessage[] {
	const result: DomainMessage[] = [];

	for (const msg of messages) {
		if (msg.type === "system_with_skill") {
			// 保留 system content
			result.push({
				type: "system",
				content: msg.content,
			});

			// 将 skills 转为 user 消息
			if (msg.skills && msg.skills.length > 0) {
				const skillsText = formatSkills(msg.skills, tags);
				result.push({
					type: "generic_user_text",
					content: `${triggerPromptContent}\n\n${skillsText}`,
				});
			}
		} else {
			result.push(msg);
		}
	}

	return result;
}

/**
 * 清除 show tool 调用之前的 reasoning 文本。
 *
 * DeepSeek-test-1 模型中，reasoning 字段在特定 token 预算下
 * 会显著压缩 show tool 调用的准确性（show 的 type 字段误判率上升）。
 * 这消除 reasoning 与后续调用之间的注意力干扰。
 *
 * @returns 剥离 reasoning 后的消息数组，以及最后一条 show tool_result 的索引
 */
export function stripReasoningFromPromptMessages(messages: PromptMessage[]): {
	messages: PromptMessage[];
	lastShowIdx: number;
} {
	let lastShowIdx = -1;

	const stripped = messages.map((msg, idx) => {
		if (
			msg.role === "assistant" &&
			typeof msg.content === "string" &&
			msg.reasoning
		) {
			// 仅在存在 show tool 调用时剥离 reasoning
			const hasShowCall = /<show\b/.test(msg.content);
			if (hasShowCall) {
				return {
					...msg,
					reasoning: undefined,
				};
			}
		}
		// 追踪最后一条 tool 消息（role === "tool"）——用于 trigger prompt 注入
		if (msg.role === "tool") {
			lastShowIdx = idx;
		}
		return msg;
	});

	return { messages: stripped, lastShowIdx };
}
