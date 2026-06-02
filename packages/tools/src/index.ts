/**
 * @n0n/tools — 统一工具注册表
 *
 * 工具集：
 * - observe: 读文件、搜索代码、检查环境状态（无副作用）
 * - reason: 物化思考，将推理过程编码为可执行代码（无副作用）
 * - act: 执行环境变更操作（有副作用，谨慎使用）
 * - write: 文件创建/覆盖
 * - edit: 文件内容修改（影子编辑 — 意图驱动）
 * - progress: 报告进度/提交结果（动态生成）
 *
 * 每个工具使用 ToolDefinition 格式定义 + 自定义执行器绑定。
 * 工具参数通过 Zod schema 做运行时校验。
 */

import type {
	CanStartFn,
	DomainMessage,
	EditToolCall,
	ProgressToolCall,
	ToolCallRecord,
	ToolDefinition,
	ToolResult,
	ToolStreamEvent,
	WriteToolCall,
} from "@n0n/types";
import type { ToolsConfig } from "./config.ts";
import type { EditBackend } from "./edit/index.ts";
import {
	EDIT_TOOL_DEFINITION,
	EditArgsSchema,
	editToolStream,
	FreeformPatchBackend,
	StrReplaceBackend,
} from "./edit/index.ts";
import {
	ExecArgsSchema,
	execToolStream,
	makeActToolDefinition,
	makeObserveToolDefinition,
	makeReasonToolDefinition,
} from "./exec/index.ts";
import {
	makeProgressTool,
	type ProgressStatusConfig,
	progressTool,
} from "./progress.ts";
import {
	makeWriteRecover,
	WRITE_TOOL_DEFINITION,
	WriteArgsSchema,
	writeTool,
} from "./write.ts";

// ── 执行器类型 ──

type StreamExecutor = (
	tc: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
) => AsyncGenerator<ToolStreamEvent>;

type SyncExecutor = (
	tc: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
) => Promise<ToolResult> | ToolResult;

/** 截断恢复结果：恢复后的工具调用 + 执行结果 */
export interface RecoverResult {
	call: ToolCallRecord;
	result: DomainMessage;
}

/**
 * 截断恢复+执行函数：尝试从不完整的 JSON 参数中恢复并执行，返回 call+result 对。
 *
 * 始终为非流式（返回 Promise），与 execute 的 stream 模式无关。原因：
 * 截断恢复的结果不经过 scheduler/renderBuffer 流式管线，
 * 而是由 tool-recovery 模块直接产出 (call, result) 对追加到 history。
 * 截断场景下参数不完整，不适合做正常的流式执行。
 */
export type RecoverFn = (
	toolCallId: string,
	partialJson: string,
) => Promise<RecoverResult | null>;

/** 工具注册表条目 — stream 字段决定 execute 类型，recoverAndExecute 与 stream 无关 */
export type ToolEntry = {
	definition: ToolDefinition;
	recoverAndExecute?: RecoverFn;
	canStart?: CanStartFn;
} & (
	| { stream: true; execute: StreamExecutor }
	| { stream: false; execute: SyncExecutor }
);

// ── 基础注册表构建 ──

/** write/edit: 与相同 path 的工具互斥，且不能与无 path 的独占工具并行 */
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
 * 构建基础工具注册表（不含 progress）。
 * 接受完整的 ToolsConfig（含 security/agent/workspace/tempDir/editorClient）。
 */
function buildBaseRegistry(
	toolsConfig: ToolsConfig,
): Record<string, ToolEntry> {
	const resolvedWorkspace = toolsConfig.workspace;
	const execConfig = {
		workspace: toolsConfig.workspace,
		tempDir: toolsConfig.tempDir,
		platform: toolsConfig.platform,
		blocked_commands: toolsConfig.security.blocked_commands,
		default_exec_waitfor: toolsConfig.agent.default_exec_waitfor,
	};

	// observe / reason / act 共享同一个执行后端 execToolStream，
	// call.tool 透传实际工具名（"observe" / "reason" / "act"），
	// executor 将其写入 result.tool，供 formatter 和 renderer 作为围栏信号。
	const makeExecEntry = (definition: ToolDefinition): ToolEntry => ({
		definition,
		stream: true,
		execute: (tc, confirmFn) => {
			const call = {
				id: tc.id,
				tool: tc.tool as "observe" | "reason" | "act",
				args: ExecArgsSchema.parse(tc.args),
			};
			return execToolStream(call, confirmFn, execConfig);
		},
	});

	const editBackend: EditBackend =
		toolsConfig.editBackendType === "freeform-patch"
			? new FreeformPatchBackend(toolsConfig.responsesClient)
			: new StrReplaceBackend(toolsConfig.editorClient);

	return {
		observe: makeExecEntry(makeObserveToolDefinition(toolsConfig.platform)),
		reason: makeExecEntry(makeReasonToolDefinition(toolsConfig.platform)),
		act: makeExecEntry(makeActToolDefinition(toolsConfig.platform)),
		write: {
			definition: WRITE_TOOL_DEFINITION,
			stream: false,
			canStart: pathExclusiveCanStart,
			execute: (tc) => {
				const call: WriteToolCall = {
					id: tc.id,
					tool: "write" as const,
					args: WriteArgsSchema.parse(tc.args),
				};
				return writeTool(call, resolvedWorkspace);
			},
			recoverAndExecute: makeWriteRecover(resolvedWorkspace),
		},
		edit: {
			definition: EDIT_TOOL_DEFINITION,
			stream: true,
			canStart: pathExclusiveCanStart,
			execute: (tc) => {
				const call: EditToolCall = {
					id: tc.id,
					tool: "edit" as const,
					args: EditArgsSchema.parse(tc.args),
				};
				return editToolStream(call, resolvedWorkspace, editBackend);
			},
		},
	};
}

// ── Toolkit ──

export interface Toolkit {
	/** ToolDefinition 列表 — 供 client.stream() 使用 */
	tools: ToolDefinition[];
	getEntry(name: string): ToolEntry | undefined;
}

export const REGISTERED_TOOLS = new Set([
	"observe",
	"reason",
	"act",
	"write",
	"edit",
	"progress",
]);

/**
 * 构建完整的工具集（含 progress）。
 *
 * @param progressConfig progress 工具的状态配置列表。
 * @param toolsConfig 工具配置，包含 workspace、tempDir、security、editorClient 等。
 * @param model LLM 模型名称，用于选择 XML tag 风格（可选）。
 */
export function makeToolkit(
	progressConfig: ProgressStatusConfig[],
	toolsConfig: ToolsConfig,
	_model?: string,
): Toolkit {
	const progressEntry: ToolEntry = {
		definition: makeProgressTool(progressConfig),
		stream: false,
		canStart: () => true,
		execute: (tc) => {
			return progressTool(tc as ProgressToolCall);
		},
	};

	const registry: Record<string, ToolEntry> = {
		...buildBaseRegistry(toolsConfig),
		progress: progressEntry,
	};

	// 工具顺序是隐性优先级信号——模型对前置工具有注意力偏向。
	// 显式声明顺序，避免依赖 JS 对象属性的插入顺序。
	const TOOL_ORDER = [
		"progress",
		"observe",
		"reason",
		"act",
		"write",
		"edit",
	] as const;
	const tools = TOOL_ORDER.map((name) => registry[name]?.definition).filter(
		(t): t is ToolDefinition => t !== undefined,
	);

	const activeTools = new Set<string>(TOOL_ORDER);
	return {
		tools,
		getEntry: (name) => (activeTools.has(name) ? registry[name] : undefined),
	};
}

// ── Re-exports ──

export type { CanStartFn } from "@n0n/types";
export type { ResponsesClient, ToolsConfig } from "./config.ts";

export type { ProgressStatusConfig } from "./progress.ts";
