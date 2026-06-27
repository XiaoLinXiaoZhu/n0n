/**
 * show 工具 — agent 唯一的结构化输出
 *
 * 每次调用 show 时，agentLoop 终止并返回结果。
 * 外部调用方（repl.ts / headless.ts）拿到结果后自行决定是否重新启动循环。
 */

import type { ShowToolCall, ShowToolResult, ToolDefinition } from "@n0n/types";

// ── 配置类型 ──

export interface ShowTypeConfig {
	/** type 枚举值 */
	value: string;
	/** 该 type 的含义说明（写入工具顶层 description） */
	typeDesc: string;
	/** 该 type 下 content 的格式说明（写入工具顶层 description） */
	contentDesc: string;
}

// ── 工具定义生成 ──

/**
 * 根据配置列表生成 show 工具定义。
 *
 * 生成的工具：
 * - name: "show"
 * - description: 包含所有 type 的含义和对应 content 格式（从配置拼接）
 * - parameters: { type: enum[...], content: string }
 */
export function makeShowTool(config: ShowTypeConfig[]): ToolDefinition {
	const typeDocs = config
		.map((c) => `- ${c.value}: ${c.typeDesc}\n  content: ${c.contentDesc}`)
		.join("\n");

	const description = [
		"Report your status to the user. This is the ONLY way to deliver content to the user.",
		"They cannot see your reasoning, tool calls, or intermediate results. You must report your state by calling this tool. Keep the user posted.",
		"",
		"Type values:",
		typeDocs,
		"",
		"Validation is enforced — non-conforming calls will be rejected.",
	].join("\n");

	const typeEnum = config.map((c) => c.value);

	return {
		name: "show",
		description,
		parameters: {
			type: "object",
			properties: {
				type: {
					type: "string",
					enum: typeEnum,
					description: "Current report type",
				},
				content: {
					type: "string",
					description: "Content for this report type",
				},
			},
			required: ["type", "content"],
			additionalProperties: false,
		},
	};
}

// ── 执行器 ──

export function showTool(call: ShowToolCall): ShowToolResult {
	return {
		type: "tool_result",
		tool: "show" as const,
		call,
		cleanedResult: call.args,
	};
}
