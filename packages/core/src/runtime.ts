/**
 * RuntimeContext — 配置组装辅助（非全局单例）
 *
 * 提供 buildToolsConfig 工具函数，帮助 app 入口从各组件配置构造 ToolsConfig。
 * 不再维护全局状态 — 所有依赖通过参数显式传递。
 */

import { resolvePlatform } from "@n0n/shared";
import type { ToolsConfig } from "@n0n/tools";

// ── 类型 ──

export interface AgentConfig {
	max_iterations: number;
	max_idle_rounds: number;
	default_exec_waitfor: number;
}

export interface SecurityConfig {
	blocked_commands: string[];
}

/** 从工作区路径构建 ToolsConfig */
export function buildToolsConfig(
	agent: AgentConfig,
	security: SecurityConfig,
	paths: {
		workspace: string;
		tempDir: string;
		sessionDir: string;
		platform?: "win32" | "darwin" | "linux";
	},
): ToolsConfig {
	return {
		security,
		agent,
		workspace: paths.workspace,
		tempDir: paths.tempDir,
		sessionDir: paths.sessionDir,
		platform: paths.platform ?? resolvePlatform(),
	};
}
