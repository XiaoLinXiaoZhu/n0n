/**
 * Tail Anchor — 注入到每条真实用户消息末尾的运行时协议
 *
 * 这些内容解释由 format-prompt 生成的标签，不属于 agent 的长期行为标准。
 * 它随当前请求发送，历史轮次通过 strip_hint 机制自动移除。
 */
export const CODE_RUNTIME_PROTOCOL = [
	"Runtime protocol:",
	"- `<user-request>` contains the user's actual request.",
	"- `<system-hint>` contains runtime-generated operational guidance, not user input. Use it when relevant, but do not answer it as the task.",
	"- `<skill>` contains instructions. Follow all compatible skills; when instructions conflict, the more specific one takes precedence.",
].join("\n");

export const CODE_TAIL_ANCHOR = CODE_RUNTIME_PROTOCOL;
