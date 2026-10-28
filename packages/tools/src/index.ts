/**
 * @n0n/tools — 统一工具注册表
 *
 * 唯一工具 `post`，参数为 uri + body。uri 的 scheme 决定后端：
 * - exec://<runtime>/<claim>：执行代码（读、推理、变更环境统一走此路）
 * - write://<path>：以完整内容覆盖写文件
 * - customer://<kind>：向用户提问/请求填写/请求操作，打断循环等待用户
 *
 * 工具使用 ToolDefinition 格式定义 + 自定义执行器绑定。
 * 参数通过 Zod schema 做运行时校验；uri 在 execute 分发前经 parsePostUri
 * 解析，畸形 uri 转为 tool_arg_error。
 */

import type {
	CanStartFn,
	CustomerCompleted,
	PostToolCall,
	ToolDefinition,
} from "@n0n/types";
import { PostArgsSchema } from "@n0n/types";
import type { ToolsConfig } from "./config.ts";
import { execToolStream, makePostToolDefinition } from "./exec";
import {
	createToolkitSession,
	type ToolEntry,
	type ToolkitSession,
} from "./session.ts";
import { type ParsedUri, parsePostUri } from "./uri.ts";
import { makeFileRecover, writeTool } from "./write.ts";

// ── 单 entry 注册表 ──

/** uri 解析失败返回 null——调用方决定是放行（让 execute 报错）还是阻塞 */
function safeParseUri(uri: string): ParsedUri | null {
	try {
		return parsePostUri(uri);
	} catch {
		return null;
	}
}

/**
 * post 的并行准入规则（推广自旧 pathExclusiveCanStart）：
 * - 空 active set：允许并行
 * - customer 总是独占（打断循环，不得与任何调用并行）
 * - file 与同 path 的 file 串行；不同 path 的 file 可并行
 * - exec 与 exec/file 均可并行（提交顺序由调度器保证）
 * - uri 畸形：不在此拦截，放行后由 execute 转 tool_arg_error
 */
const postCanStart: CanStartFn = (self, active) => {
	if (active.length === 0) return true;

	const selfUri = safeParseUri(self.args.uri);
	if (!selfUri || selfUri.scheme === "customer") return false;

	for (const a of active) {
		const activeUri = safeParseUri(a.args.uri);
		if (!activeUri) continue;
		if (activeUri.scheme === "customer") return false;
		if (
			selfUri.scheme === "write" &&
			activeUri.scheme === "write" &&
			activeUri.path === selfUri.path
		) {
			return false;
		}
	}
	return true;
};

/**
 * 构建 `post` 单 entry：exec/file/customer 三个后端共用一个工具名，
 * execute 内按解析出的 scheme 调度。
 */
function buildPostEntry(toolsConfig: ToolsConfig): ToolEntry {
	const execConfig = {
		workspace: toolsConfig.workspace,
		sessionDir: toolsConfig.sessionDir,
		blocked_commands: toolsConfig.security.blocked_commands,
		default_exec_waitfor: toolsConfig.agent.default_exec_waitfor,
		max_exec_output_tokens: toolsConfig.agent.max_exec_output_tokens,
		platform: toolsConfig.platform,
		bgSyncIntervalMs: toolsConfig.bgSyncIntervalMs,
	};

	return {
		definition: makePostToolDefinition(
			toolsConfig.platform,
			toolsConfig.agent.max_exec_output_tokens,
			toolsConfig.agent.default_exec_waitfor,
			toolsConfig.allowCustomer,
		),
		canStart: postCanStart,
		execute: async function* (tc, confirmFn) {
			const args = PostArgsSchema.parse(tc.args);

			let parsed: ParsedUri;
			try {
				parsed = parsePostUri(args.uri);
			} catch (err) {
				// 畸形/不支持的 uri 是参数错误，不是执行错误
				yield {
					type: "tool_arg_error",
					callId: tc.id,
					tool: "post",
					error: {
						kind: "invalid_args",
						issues: [
							{
								path: "uri",
								message: err instanceof Error ? err.message : String(err),
							},
						],
					},
				};
				return;
			}

			const call: PostToolCall = { id: tc.id, tool: "post", args };

			switch (parsed.scheme) {
				case "exec":
					yield* execToolStream(call, confirmFn, execConfig);
					return;
				case "write":
					yield await writeTool(call, toolsConfig.workspace);
					return;
				case "customer": {
					if (toolsConfig.allowCustomer === false) {
						yield {
							type: "tool_arg_error",
							callId: tc.id,
							tool: "post",
							error: {
								kind: "invalid_args",
								issues: [
									{
										path: "uri",
										message: "customer:// is not available in this mode.",
									},
								],
							},
						};
						return;
					}
					const result: CustomerCompleted = {
						type: "tool_result",
						tool: "post",
						call,
						status: "completed",
						scheme: "customer",
						kind: parsed.kind,
					};
					yield result;
					return;
				}
			}
		},
		recover: makeFileRecover(toolsConfig.workspace),
	};
}

// ── Toolkit ──

export interface Toolkit {
	/** ToolDefinition 列表 — 供 client.stream() 使用 */
	tools: ToolDefinition[];
	bind(confirmFn?: (question: string) => Promise<string>): ToolkitSession;
}

/**
 * 构建完整工具集（唯一 `post` 工具）。
 *
 * @param toolsConfig 工具配置，包含 workspace、sessionDir、security 等。
 * @param model LLM 模型名称（可选，保留接口兼容）。
 */
export function makeToolkit(
	toolsConfig: ToolsConfig,
	_model?: string,
): Toolkit {
	const registry: Record<string, ToolEntry> = {
		post: buildPostEntry(toolsConfig),
	};

	// 工具顺序是隐性优先级信号——模型对前置工具有注意力偏向。
	// 唯一工具也显式声明顺序，保持与旧注册表相同的取用路径。
	const TOOL_ORDER = ["post"] as const;
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

export type {
	PartialToolCall,
	RecoveredPair,
	ToolRecover,
	UnrecoverableCall,
} from "./recovery.ts";
export type { ToolJob, ToolkitSession } from "./session.ts";
export type { ParsedUri } from "./uri.ts";
export { parsePostUri } from "./uri.ts";
