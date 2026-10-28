/**
 * format-prompt — DomainMessage[] → PromptMessage[]
 *
 * 纯编排层。将领域消息转换为协议无关的提示词消息格式。
 * 所有含自然语言的格式化逻辑委托给各自的子模块，
 * 每个模块内维护 anti-few-shot 表述变体。
 *
 * TagAdapter 注入：各 LLM Client 构造自己的 TagAdapter 实例传入，
 * 控制 XML tag 的风格。各 provider 可对特定 tag name 做特殊处理。
 *
 * system-hint 保留策略：工具返回的 <system-hint> 与用户消息的 hint
 * 在所有轮次原样保留，不做历史剥离。历史验证：剥离机制需要改写历史
 * 消息（最新轮→历史轮时删除 hint），修改点之后的 token 全部重算，
 * prompt cache 命中率显著下降——收益不抵缓存代价，已移除。
 *
 * Anti-few-shot 设计动机（参考 Manus "Don't Get Few-Shotted"）：
 * LLM 是出色的模仿者，会复现上下文中的行为模式。当上下文充满结构
 * 相同的"行动-观测"对时，模型倾向于遵循该模式，即使它不再是最佳
 * 选择——导致偏离、过度泛化甚至幻觉。解决方法是在行动和观测中引入
 * 受控的结构化变体（不同的序列化模板、替代措辞、格式微噪音），
 * 打破模式并调整模型注意力。上下文越统一，Agent 越脆弱。
 *
 * 不包含：协议消息格式构造、prompt caching 注入 — 这些属于 Client 内部。
 */

import type {
	DomainMessage,
	PromptMessage,
	TagAdapter,
	ToolCallPart,
	ToolResult,
} from "@n0n/types";
import { affectsSubsequent } from "./config.ts";
import { formatCustomerResult } from "./format-customer.ts";
import { formatExecResult } from "./format-exec.ts";
import { formatFileResult } from "./format-file.ts";
import { formatSkills } from "./format-skill.ts";
import { formatTodoResult } from "./format-todo.ts";
import { formatToolArgError } from "./format-tool-arg-error.ts";
import { formatTurnFeedback } from "./format-turn-feedback.ts";
import type { FormattedToolResult } from "./utils.ts";

// ── tool result 分发 ──

function toolResultToStructured(
	msg: ToolResult,
	tags: TagAdapter,
	msgIndex: number,
): FormattedToolResult {
	switch (msg.scheme) {
		case "exec":
			return formatExecResult(msg, tags, msgIndex);
		case "write":
			return formatFileResult(msg, tags, msgIndex);
		case "customer":
			return formatCustomerResult(msg, tags, msgIndex);
		case "todo":
			return formatTodoResult(msg, tags, msgIndex);
		default: {
			const _exhaustive: never = msg;
			throw new Error(`Unknown tool scheme`);
		}
	}
}

// ── user_input 构建 ──

/**
 * 构建 user_input 消息的最终文本内容。
 *
 * 排列顺序（由远及近，尾部获得最强注意力）：
 * 1. context — 环境背景信息（仅首次）
 * 2. mentionedSkills — 用户引用的 skill（规则/约束层）
 * 3. user-request — 用户实际输入（意图层）
 * 4. system-hint — 系统行为引导（尾部锚定，占据本地注意力窗口）
 */
function buildUserInputContent(
	msg: Extract<DomainMessage, { type: "user_input" }>,
	tags: TagAdapter,
): string {
	const parts: string[] = [];
	if (msg.context) {
		parts.push(tags.wrapTag("context", msg.context));
	}
	if (msg.mentionedSkills.length > 0) {
		parts.push(formatSkills(msg.mentionedSkills, tags));
	}
	// 用户实际输入用 <user-request> 包裹，紧邻尾部锚定块
	parts.push(tags.wrapTag("user-request", msg.content));
	if (msg.hint) {
		parts.push(tags.wrapTag("system-hint", msg.hint));
	}
	return parts.join("\n\n");
}

// ── 连续 system 消息合并 ──

function mergeConsecutiveSystem(messages: PromptMessage[]): PromptMessage[] {
	const merged: PromptMessage[] = [];
	for (const msg of messages) {
		const prev = merged[merged.length - 1];
		if (msg.role === "system" && prev?.role === "system") {
			merged[merged.length - 1] = {
				role: "system",
				content: `${prev.content}\n\n${msg.content}`,
			};
		} else {
			merged.push(msg);
		}
	}
	return merged;
}

// ── 主函数 ──

/**
 * DomainMessage[] → PromptMessage[]
 *
 * @param messages 领域消息历史
 * @param tags TagAdapter 实例，由 LLM Client 构造注入
 */
export function formatPrompt(
	messages: DomainMessage[],
	tags: TagAdapter,
): PromptMessage[] {
	const result: PromptMessage[] = [];

	let i = 0;
	for (const msg of messages) {
		if (!msg) continue;

		switch (msg.type) {
			case "system":
				result.push({
					role: "system",
					content: tags.adaptTags(msg.content),
				});
				break;

			case "system_with_skill": {
				const skillsText = formatSkills(msg.skills, tags);
				result.push({
					role: "system",
					content: tags.adaptTags(msg.content),
				});
				if (skillsText) {
					result.push({ role: "user", content: skillsText });
				}
				break;
			}

			case "generic_user_text":
				result.push({ role: "user", content: msg.content });
				break;

			case "user_image":
				result.push({
					role: "user",
					content: `[Image: ${msg.imagePath}] ${msg.text}`,
				});
				break;

			case "assistant_text":
				result.push({
					role: "assistant",
					content: msg.content,
					reasoning: msg.reasoning.ok ? msg.reasoning.value : undefined,
					reasoningSignature: msg.reasoningSignature,
				});
				break;

			case "assistant_tool_call": {
				const toolCalls: ToolCallPart[] = msg.toolCalls.map((tc) => ({
					id: tc.id,
					tool: tc.tool,
					args: tc.args,
				}));
				result.push({
					role: "assistant",
					content: msg.content ?? "",
					reasoning: msg.reasoning.ok ? msg.reasoning.value : undefined,
					reasoningSignature: msg.reasoningSignature,
					toolCalls,
				});
				break;
			}

			case "tool_result": {
				const formatted = toolResultToStructured(msg, tags, i);
				// fact + hint 全轮保留：hint 剥离会改写历史消息，破坏 prompt cache
				const content = formatted.hint
					? `${formatted.fact}\n${tags.wrapTag("system-hint", formatted.hint)}`
					: formatted.fact;

				result.push({
					role: "tool",
					toolCallId: msg.call.id,
					toolName: msg.call.tool,
					content,
				});
				break;
			}

			case "user_input": {
				result.push({
					role: "user",
					content: buildUserInputContent(msg, tags),
				});
				break;
			}

			case "turn_feedback": {
				result.push({
					role: "user",
					content: formatTurnFeedback(msg, tags, i),
				});
				break;
			}

			case "tool_arg_error":
				result.push({
					role: "tool",
					toolCallId: msg.callId,
					toolName: msg.tool,
					content: formatToolArgError(msg, tags, i),
				});
				break;

			case "generic_tool_call": {
				const toolCalls: ToolCallPart[] = msg.toolCalls.map((tc) => ({
					id: tc.id,
					tool: tc.tool,
					args: tc.args,
				}));
				result.push({
					role: "assistant",
					content: msg.content ?? "",
					toolCalls,
				});
				break;
			}

			case "generic_tool_result":
				result.push({
					role: "tool",
					toolCallId: msg.callId,
					toolName: msg.toolName,
					content: msg.content,
				});
				break;

			case "cache_breakpoint": {
				const prev = result[result.length - 1];
				if (prev) {
					prev.cacheBreakpoint = true;
				}
				break;
			}

			case "token_usage":
				// token 用量是 LLM 调用元数据，不产生提示词输出
				break;

			default: {
				const _exhaustive: never = msg;
				throw new Error(
					`Unhandled message type: ${(_exhaustive as unknown as Record<string, unknown>).type}`,
				);
			}
		}

		// 避免 cache_breakpoint 消息滑动时影响其他的消息的 index
		// 变更index可能会导致其他消息格式化的时候格式化后的内容发生变化，从而影响提示词缓存。
		if (affectsSubsequent(msg.type)) {
			i++;
		}
	}

	return mergeConsecutiveSystem(result);
}

export { formatSkills } from "./format-skill.ts";
