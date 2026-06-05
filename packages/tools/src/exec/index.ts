/**
 * exec 工具模块
 *
 * 拆分为子模块：
 * - role: ExecRole 类型定义 — observe/reason/act 的一等概念
 * - definition: LLM 工具描述生成
 * - security: 命令黑名单检测与用户确认
 * - executor: 脚本执行（含 waitfor 等待超限转后台机制）
 * - process-runner: 子进程命令构建与执行
 */

export type { ExecRole } from "./role.ts";
export { EXEC_ROLES } from "./role.ts";
export {
	ExecArgsSchema,
	makeExecToolDefinition,
} from "./definition.ts";
export type { ExecCall } from "./executor.ts";
export { execToolStream } from "./executor.ts";
export type { RunProcessResult } from "./process-runner.ts";
export { buildSpawnCmd, RUNTIME_EXT } from "./process-runner.ts";
export {
	extractCommandNames,
	findBlockedCommand,
	handleBlockedCommand,
} from "./security.ts";
