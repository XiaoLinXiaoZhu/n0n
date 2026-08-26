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
	"- `<skill>` contains active standards, task procedures, directives, or capabilities. Apply them by their stated responsibility and use the Self-Function standard for conflict handling; tag position does not define precedence.",
].join("\n");

export const CODE_TAIL_ANCHOR = CODE_RUNTIME_PROTOCOL;

export const NO_CUSTOMER_PARTICIPATION_HINT = [
	CODE_RUNTIME_PROTOCOL,
	"",
	"Order condition:",
	"- The customer has provided all requirements and customer-supplied inputs for this production cycle and will not later provide information, make decisions, or perform actions.",
	"- Work autonomously only within the existing result, scope, permissions, and inputs. This condition grants no additional authority.",
	"- End with `qualified delivery` if the acceptance baseline is satisfied; otherwise end with `production suspended` or `production failed` according to the actual condition.",
].join("\n");
