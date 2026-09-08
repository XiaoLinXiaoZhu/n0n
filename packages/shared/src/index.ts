/**
 * @n0n/shared — 跨包共享的工具函数
 *
 * 大部分函数是纯函数，通过参数接收所需上下文；
 * process.ts 提供受控的子进程执行辅助。
 * 不依赖任何配置或运行时状态。
 *
 * 注意：format-prompt 已迁移至独立包 @n0n/format-prompt。
 */

// AGENTS.md
export { formatAgentsMdPrompt, loadAgentsMd } from "./agents-md.ts";
// Conversation Log
export type {
	ConversationLog,
	HumanReadableInfo,
} from "./conversation-log";
export {
	generateLogFileName,
	loadConversation,
	saveConversation,
} from "./conversation-log";
// Deep parse JSON strings
export { deepParseJsonStrings } from "./deep-parse-json-strings.ts";
// Frontmatter
export type { RawFrontmatter, TypedFrontmatter } from "./frontmatter.ts";
export {
	extractNestedBlock,
	extractRawYaml,
	parseFrontmatter,
} from "./frontmatter.ts";
// DSL Parser
export { parseDsl } from "./parse-dsl.ts";
// Process
export type {
	RunCommandErrorDetails,
	RunCommandFn,
	RunCommandOptions,
	RunCommandResult,
} from "./process.ts";
export { RunCommandError, runCommand } from "./process.ts";
// StreamAccumulator
export { StreamAccumulator } from "./stream-accumulator.ts";
// Tags
export {
	closeTag,
	createTagAdapter,
	openTag,
	type TagAdapter,
	type TagStyle,
} from "./tags.ts";
export {
	estimateTokens,
	headByTokens,
	headTailByTokens,
	tailByTokens,
} from "./tokens.ts";
// Workspace
export type { BaseWorkspacePaths } from "./workspace.ts";
export {
	createSessionDir,
	ensureDirs,
	parseWorkspaceArg,
	resolveBasePaths,
	resolvePlatform,
} from "./workspace.ts";
