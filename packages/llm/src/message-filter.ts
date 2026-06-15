/**
 * 消息过滤工具 — 过滤空的 user/assistant 消息
 *
 * 多个 OpenAI-compatible Client 共享此逻辑：
 * 避免向 API 发送空的 user 消息（无 content）或空的 assistant 消息
 * （无 content 且无 tool_calls），防止 API 返回错误。
 */

interface FilterableMessage {
	role: string;
	content?: string | null;
	/** 仅需数组判断（length > 0），不关心元素类型 */
	tool_calls?: unknown[] | null;
}

/**
 * 过滤空的 user 和 assistant 消息。
 *
 * - user 消息无 content → 移除
 * - assistant 消息无 content 且无 tool_calls → 移除
 */
export function filterEmptyMessages<T extends FilterableMessage>(
	messages: T[],
): T[] {
	return messages.filter((msg) => {
		if (msg.role === "user" && !(msg.content ?? "").trim()) return false;
		if (
			msg.role === "assistant" &&
			!msg.content?.trim() &&
			!(msg.tool_calls && msg.tool_calls.length > 0)
		)
			return false;
		return true;
	});
}
