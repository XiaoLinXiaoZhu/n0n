/**
 * Tools 配置类型
 *
 * 移除 edit 后，不再需要 editBackendType 的 discriminated union。
 */

export interface ToolsConfig {
	security: {
		blocked_commands: string[];
	};
	agent: {
		default_exec_waitfor: number;
		max_exec_output_tokens: number;
	};
	platform: "win32" | "darwin" | "linux";
	workspace: string;
	sessionDir: string;
	bgSyncIntervalMs?: number;
	/** 是否向模型提供 customer:// 交互（默认提供）。false 时描述省略该 scheme，执行时以 arg-error 拒绝。 */
	allowCustomer?: boolean;
}
