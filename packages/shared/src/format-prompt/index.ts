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
 * system-hint 剥离策略：
 * 工具返回中包含 fact（客观数据）和 hint（系统操作建议）两部分。
 * 启用剥离时，仅最新一轮（最后一个 assistant_tool_call 之后）的 tool_result
 * 包含 <system-hint>；历史轮次只保留 fact，减少过时指令污染和 token 开销。
 * 通过 N0N_STRIP_HINT=1 环境变量启用（默认启用，设为 0 可关闭用于对比测试）。
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
import { formatExecResult } from "./format-exec.ts";
import { formatIdleNudge } from "./format-idle-nudge.ts";
import { formatProgressResult } from "./format-progress.ts";
import { formatSkills } from "./format-skill.ts";
import { formatToolArgError } from "./format-tool-arg-error.ts";
import { formatTurnFeedback } from "./format-turn-feedback.ts";
import { formatWriteResult } from "./format-write.ts";
import type { FormattedToolResult } from "./utils.ts";

// ── tool result 分发 ──

function toolResultToStructured(
	msg: ToolResult,
	tags: TagAdapter,
	msgIndex: number,
): FormattedToolResult {
	switch (msg.tool) {
		case "observe":
		case "reason":
		case "act":
			return formatExecResult(msg, tags, msgIndex);
		case "write":
			return formatWriteResult(msg, tags, msgIndex);
		case "progress":
			return formatProgressResult(msg, tags, msgIndex);
		default: {
			const _exhaustive: never = msg;
			throw new Error(`Unknown tool`);
		}
	}
}

// ── user_input 构建 ──

function buildUserInputContent(
	msg: Extract<DomainMessage, { type: "user_input" }>,
	tags: TagAdapter,
	includeHint: boolean,
): string {
	const parts: string[] = [];
	if (msg.context) {
		parts.push(tags.wrapTag("context", msg.context));
	}
	// 用户实际输入用 <user-request> 包裹，增强历史记录中系统指令与用户输入的可辨性
	parts.push(tags.wrapTag("user-request", msg.content));
	if (msg.mentionedSkills.length > 0) {
		parts.push(formatSkills(msg.mentionedSkills, tags));
	}
	if (includeHint && msg.hint) {
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

// ── 找最后一个 assistant_tool_call 的原始 index ──

function findLastAssistantToolCallIndex(messages: DomainMessage[]): number {
	for (let j = messages.length - 1; j >= 0; j--) {
		if (messages[j]?.type === "assistant_tool_call") return j;
	}
	return -1;
}

// ── 格式化选项 ──

/** 格式化选项 — 由 LLMClient 构造时注入 */
export interface FormatOptions {
	/** 是否剥离历史轮次的 system-hint（默认 true） */
	strip_hint?: boolean;
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
	options?: FormatOptions,
): PromptMessage[] {
	const stripHintEnabled = options?.strip_hint ?? true;
	const result: PromptMessage[] = [];

	// 预扫描：找到最后一个 assistant_tool_call 的原始 index，用于判断"最新轮"
	const lastAtcIndex = findLastAssistantToolCallIndex(messages);

	let i = 0;
	let originalIndex = 0;
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
				const base = tags.adaptTags(msg.content);
				result.push({
					role: "system",
					content: skillsText ? `${base}\n\n${skillsText}` : base,
				});
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
				const isLatestRound = originalIndex > lastAtcIndex;
				let content: string;

				if (!stripHintEnabled || isLatestRound) {
					// 剥离未启用 或 最新轮：包含 hint
					content = formatted.hint
						? `${formatted.fact}\n${tags.wrapTag("system-hint", formatted.hint)}`
						: formatted.fact;
				} else {
					// 历史轮：只保留 fact
					content = formatted.fact;
				}

				result.push({
					role: "tool",
					toolCallId: msg.call.id,
					toolName: msg.call.tool,
					content,
				});
				break;
			}

			case "idle_nudge":
				result.push({
					role: "user",
					content: formatIdleNudge(msg, tags, i),
				});
				break;

			case "user_input": {
				const isLatestRound = originalIndex > lastAtcIndex;
				result.push({
					role: "user",
					content: buildUserInputContent(
						msg,
						tags,
						!stripHintEnabled || isLatestRound,
					),
				});
				break;
			}

			case "turn_feedback":
				result.push({
					role: "user",
					content: formatTurnFeedback(msg, tags, i),
				});
				break;

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
		originalIndex++;
	}

	// ── 自动 cache breakpoint：标记最后一个含 toolCalls 的 assistant 消息 ──
	if (stripHintEnabled) {
		for (let j = result.length - 1; j >= 0; j--) {
			const m = result[j];
			if (m && m.role === "assistant" && m.toolCalls?.length) {
				result[j] = { ...m, cacheBreakpoint: true };
				break;
			}
		}
	}

	return mergeConsecutiveSystem(result);
}
