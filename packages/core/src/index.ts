/**
 * @n0n/core — Agent Loop 核心
 *
 * 只包含 agentLoop 核心循环 + 配置构建辅助。
 * 通用工具（workspace、skills、frontmatter）在 @n0n/shared。
 */

// Agent Loop
export type { AgentOptions, AgentResult } from "./agent/loop.ts";
export { agentLoop } from "./agent/loop.ts";
// Heartbeat
export type {
	Clock,
	HeartbeatCallbacks,
	HeartbeatConfig,
} from "./heartbeat/index.ts";
export {
	HeartbeatKeeper,
	HeartbeatState,
	realClock,
} from "./heartbeat/index.ts";
// 配置构建辅助
export type { AgentConfig, SecurityConfig } from "./runtime.ts";
export { buildToolsConfig } from "./runtime.ts";
// PlainRenderer（供需要默认渲染器的场景）
export { PlainRenderer } from "./ui/renderer.ts";
