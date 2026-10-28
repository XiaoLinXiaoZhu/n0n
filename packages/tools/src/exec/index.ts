/**
 * exec 工具模块 — post 工具的 exec:// 后端
 *
 * 拆分为子模块：
 * - definition: LLM 工具描述生成（唯一工具 post）
 * - security: 命令黑名单检测与用户确认
 * - executor: 脚本执行（含 waitfor 等待超限转后台机制）
 * - process-runner: 子进程命令构建与执行
 */

export {
	makePostArgsSchema,
	makePostToolDefinition,
	PostArgsSchema,
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
