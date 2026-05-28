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
	max_iterations: number;
	max_idle_rounds: number;
	default_exec_waitfor: number;
}

export interface SecurityConfig {
	blocked_commands: string[];
}

/** 编辑后端配置 — discriminated union，与 ToolsConfig 的 edit 部分对齐 */
export type EditBackendConfig =
	| { type: "str-replace"; editorClient: LLMClient }
	| { type: "freeform-patch"; responsesClient: ResponsesClient };

/** 从编辑后端配置 + 工作区路径构建 ToolsConfig */
export function buildToolsConfig(
	editBackend: EditBackendConfig,
	agent: AgentConfig,
	security: SecurityConfig,
	paths: {
		workspace: string;
		tempDir: string;
		platform?: "win32" | "darwin" | "linux";
	},
): ToolsConfig {
	const base = {
		security,
		agent,
		workspace: paths.workspace,
		tempDir: paths.tempDir,
		platform:
			paths.platform ?? (process.platform as "win32" | "darwin" | "linux"),
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
