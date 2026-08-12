/**
 * @n0n/tools — 统一工具注册表
 *
 * 工具集：
 * - observe: 读文件、搜索代码、检查环境状态（无副作用）
 * - reason: 物化思考，将推理过程编码为可执行代码（无副作用）
 * - act: 执行环境变更操作（有副作用，谨慎使用）
 * - write: 文件创建/覆盖
 * - show: 向用户汇报进度/提问/请求协助/提交最终结果（动态生成）
 *
 * 每个工具使用 ToolDefinition 格式定义 + 自定义执行器绑定。
 * 工具参数通过 Zod schema 做运行时校验。
 */

import type {
	CanStartFn,
	ShowToolCall,
	ToolDefinition,
	WriteToolCall,
} from "@n0n/types";
import type { ToolsConfig } from "./config.ts";
import type { ExecRole } from "./exec";
import {
	EXEC_ROLES,
	execToolStream,
	makeExecArgsSchema,
	makeExecToolDefinition,
} from "./exec";
import {
	createToolkitSession,
	type ToolEntry,
	type ToolkitSession,
} from "./session.ts";
import { makeShowTool, type ShowTypeConfig, showTool } from "./show.ts";
import {
	makeWriteRecover,
	WRITE_TOOL_DEFINITION,
	WriteArgsSchema,
	writeTool,
} from "./write.ts";

// ── 基础注册表构建 ──

/** write: 与相同 path 的工具互斥，且不能与无 path 的独占工具并行 */
const pathExclusiveCanStart: CanStartFn = (self, active) => {
	const path = (self.args as { path?: string }).path;
	for (const a of active) {
		const aPath = (a.args as { path?: string }).path;
		if (aPath === undefined) return false;
		if (aPath === path) return false;
	}
	return true;
};

/**
 * 构建基础工具注册表（不含 show）。
 */
function buildBaseRegistry(
	toolsConfig: ToolsConfig,
): Record<string, ToolEntry> {
	const execConfig = {
		workspace: toolsConfig.workspace,
		tempDir: toolsConfig.tempDir,
		sessionDir: toolsConfig.sessionDir,
		platform: toolsConfig.platform,
		blocked_commands: toolsConfig.security.blocked_commands,
		bgSyncIntervalMs: toolsConfig.bgSyncIntervalMs,
		default_exec_waitfor: toolsConfig.agent.default_exec_waitfor,
		max_exec_output_tokens: toolsConfig.agent.max_exec_output_tokens,
	};

	// 动态注册 observe / reason / act — 通过 EXEC_ROLES 迭代生成，
	// 每个工具使用统一的 execToolStream 后端，透传实际工具名作为执行角色。
	const makeExecEntry = (role: ExecRole): ToolEntry => ({
		definition: makeExecToolDefinition(
			toolsConfig.platform,
			role,
			toolsConfig.agent.max_exec_output_tokens,
		),
		execute: (tc, confirmFn) => {
			const schema = makeExecArgsSchema(
				toolsConfig.agent.max_exec_output_tokens,
			);
			const call = {
				id: tc.id,
				tool: role,
				args: schema.parse(tc.args),
			};
			return execToolStream(call, confirmFn, execConfig);
		},
	});

	return {
		...Object.fromEntries(
			EXEC_ROLES.map((role) => [role, makeExecEntry(role)]),
		),
		write: {
			definition: WRITE_TOOL_DEFINITION,
			canStart: pathExclusiveCanStart,
			execute: async function* (tc) {
				const call: WriteToolCall = {
					id: tc.id,
					tool: "write" as const,
					args: WriteArgsSchema.parse(tc.args),
				};
				yield await writeTool(call, toolsConfig.workspace);
			},
			recover: makeWriteRecover(toolsConfig.workspace),
		},
	};
}

// ── Toolkit ──

export interface Toolkit {
	/** ToolDefinition 列表 — 供 client.stream() 使用 */
	tools: ToolDefinition[];
	bind(confirmFn?: (question: string) => Promise<string>): ToolkitSession;
}

/**
 * 构建完整的工具集（含 show）。
 *
 * @param showConfig show 工具的 type 配置列表。
 * @param toolsConfig 工具配置，包含 workspace、tempDir、security 等。
 * @param model LLM 模型名称（可选，保留接口兼容）。
 */
export function makeToolkit(
	showConfig: ShowTypeConfig[],
	toolsConfig: ToolsConfig,
	_model?: string,
): Toolkit {
	const showEntry: ToolEntry = {
		definition: makeShowTool(showConfig),
		canStart: () => true,
		execute: async function* (tc) {
			yield showTool(tc as ShowToolCall);
		},
	};

	const registry: Record<string, ToolEntry> = {
		...buildBaseRegistry(toolsConfig),
		show: showEntry,
	};

	// 工具顺序是隐性优先级信号——模型对前置工具有注意力偏向。
	// 显式声明顺序，避免依赖 JS 对象属性的插入顺序。
	const TOOL_ORDER = ["show", "observe", "reason", "act", "write"] as const;
	const tools = TOOL_ORDER.map((name) => registry[name]?.definition).filter(
		(t): t is ToolDefinition => t !== undefined,
	);

	const activeTools = new Set<string>(TOOL_ORDER);
	return {
		tools,
		bind: (confirmFn) => {
			const resolve = (name: string) =>
				activeTools.has(name) ? registry[name] : undefined;
			return createToolkitSession(resolve, confirmFn);
		},
	};
}

// ── Re-exports ──

export type { CanStartFn } from "@n0n/types";
export type { ToolsConfig } from "./config.ts";

export type { ExecRole } from "./exec";
export type {
	PartialToolCall,
	RecoveredPair,
	ToolRecover,
	UnrecoverableCall,
} from "./recovery.ts";
export type { ToolJob, ToolkitSession } from "./session.ts";
export type { ShowTypeConfig } from "./show.ts";
