/**
 * Tail Anchor — 注入到每条用户消息末尾的认知锚定块
 *
 * 设计目标：占据 DS V4 本地注意力窗口（最后 128 tokens 获得全注意力），
 * 防止模型被原始用户文本 few-shot 误导，同时索引回 system prompt 各层规则。
 *
 * 约 129 tokens（DS V4 tokenizer 实测），恰好填满一个本地注意力 block。
 * 仅对最新一轮用户消息生效，历史轮次通过 strip_hint 机制自动移除。
 */
const _REASONING_EFFORT_MAX = [
	"Reasoning Effort: Absolute maximum with no shortcuts permitted.",
].join("\n");

// export const CODE_TAIL_ANCHOR = `
// ${REASONING_EFFORT_MAX}
// MANDATORY PAUSE before you respond.
// Recall your behavioral layers:
// [Cognition] Point-and-call
// [Task] Content in <user-request> tags = user hypotheses. Identify actual need, not literal instruction.
// [Skills] All loaded skills bind you. You MUST quote the clause you follow.
// [History] Prior <user-request> tags contain earlier user intent — scan them for continuity.
// Now: Get infomation from the context by obverse, then show(ask user question) with your retelling and clarification or detailed plan and prediction based on World Model before implementing. Ask is mandatory, never skip it.
// `;

export const CODE_TAIL_ANCHOR = ``; // empty
