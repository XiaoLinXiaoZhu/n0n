/**
 * RuntimeContext — 配置组装辅助（非全局单例）
 *
 * 提供 buildToolsConfig 工具函数，帮助 app 入口从各组件配置构造 ToolsConfig。
 * 不再维护全局状态 — 所有依赖通过参数显式传递。
 */

import type { ResponsesClient, ToolsConfig } from "@n0n/tools";
import type { LLMClient } from "@n0n/types";

// ── 类型 ──

export interface AgentConfig {
	maxIterations: number;
	maxIdleRounds: number;
	defaultExecWaitfor: number;
}

export interface SecurityConfig {
	blockedCommands: string[];
}

/** 编辑后端配置 — discriminated union，与 ToolsConfig 的 edit 部分对齐 */
export type EditBackendConfig =
	| { type: "str-replace"; editorClient: LLMClient }
	| { type: "freeform-patch"; responsesClient: ResponsesClient };

// ── 配置构建辅助 ──

/** 从 ConfigSource 构建 AgentConfig */
export function buildAgentConfig(source: Record<string, string>): AgentConfig {
	const maxIter = source.AGENT_MAX_ITERATIONS;
	const maxIdle = source.AGENT_MAX_IDLE_ROUNDS;
	const waitfor = source.AGENT_DEFAULT_EXEC_WAITFOR;
	return {
		maxIterations: maxIter ? Number.parseInt(maxIter, 10) : 50,
		maxIdleRounds: maxIdle ? Number.parseInt(maxIdle, 10) : 5,
		defaultExecWaitfor: waitfor ? Number.parseInt(waitfor, 10) : 120,
	};
}

/** 从 ConfigSource 构建 SecurityConfig */
export function buildSecurityConfig(source: Record<string, string>): SecurityConfig {
	const raw = source.BLOCKED_COMMANDS;
	const blockedCommands = raw
		? raw.split(",").map((c) => c.trim()).filter((c) => c.length > 0)
		: [];
	return { blockedCommands };
}

/** 从编辑后端配置 + 工作区路径构建 ToolsConfig */
export function buildToolsConfig(
	editBackend: EditBackendConfig,
	agent: AgentConfig,
	security: SecurityConfig,
	paths: { workspace: string; tempDir: string },
): ToolsConfig {
	const base = {
		security,
		agent,
		workspace: paths.workspace,
		tempDir: paths.tempDir,
	};
	if (editBackend.type === "freeform-patch") {
		return {
			...base,
			editBackendType: "freeform-patch",
			responsesClient: editBackend.responsesClient,
		};
	}
	return {
		...base,
		editBackendType: "str-replace",
		editorClient: editBackend.editorClient,
	};
}
