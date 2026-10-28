/**
 * todo scheme — 会话级计划/进度持久化
 *
 * body 是（可嵌套的）Markdown todo list，原样落盘到 session todo store
 * （<sessionDir>/todo/<goal>.md），同 goal 写入即整体替换。
 * 与 exec 的后台 artifact（<sessionDir>/exec/runs/）同级惯例。
 *
 * 调度事实：resourceKey = goal — 同 goal 串行、不同 goal 并行，
 * 且与 exec/write 无共享资源冲突。
 * 恢复能力：支持（截断的 markdown body 仍落盘，标记 recovered）。
 */

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { PostToolCall, TodoCompleted, TodoRecovered } from "@n0n/types";
import { decodeSegment, isUnsafeFilenameSegment } from "./parse-utils.ts";
import type { SchemeHandler } from "./types.ts";

/** todo:// 的解析产物 */
export interface ParsedTodo {
	scheme: "todo";
	/** uri 中的 goal 段（URL 解码后），同时是持久化文件名 */
	goal: string;
}
/**
 * goal 直接来自模型输入并用作文件名——在边界（parse）用
 * isUnsafeFilenameSegment 拒绝路径穿越与文件系统危险字符，
 * 不允许不确定性流入存储层。
 */

/** 持久化路径：<sessionDir>/todo/<goal>.md */
function todoPath(sessionDir: string, goal: string): string {
	return join(sessionDir, "todo", `${goal}.md`);
}

async function writeTodo(
	call: PostToolCall,
	parsed: ParsedTodo,
	ctx: { sessionDir: string },
	successStatus: "completed" | "recovered",
): Promise<TodoCompleted | TodoRecovered> {
	const filePath = todoPath(ctx.sessionDir, parsed.goal);
	const dir = join(ctx.sessionDir, "todo");
	if (!existsSync(dir)) {
		mkdirSync(dir, { recursive: true });
	}
	await Bun.write(filePath, call.args.body);
	return {
		type: "tool_result",
		tool: "post",
		call,
		status: successStatus,
		scheme: "todo",
		goal: parsed.goal,
		path: filePath,
	};
}

export const todoScheme: SchemeHandler<ParsedTodo> = {
	scheme: "todo",
	uriPrefix: "todo://",
	bodyHint: "the Markdown todo list for todo://",

	describe() {
		return [
			"todo — todo://<goal> . Body is a Markdown todo list (nesting allowed); it is persisted to your session's todo store and replaces the previous list for <goal>. Use it to plan multi-step work and track progress across rounds.",
		];
	},

	parse(rest, fullUri) {
		// todo:// 之后全部是 goal（URL 解码），无 query 语义
		const goal = decodeSegment(rest);
		if (!goal) {
			throw new Error(`Malformed todo uri "${fullUri}". Missing goal.`);
		}
		if (isUnsafeFilenameSegment(goal)) {
			throw new Error(
				`Malformed todo uri "${fullUri}". Goal must be a plain name (no path separators or control characters).`,
			);
		}
		return { scheme: "todo", goal };
	},

	resourceKey: (parsed) => parsed.goal,

	async *execute(parsed, call, ctx) {
		yield await writeTodo(call, parsed, ctx, "completed");
	},

	async recover(extracted, toolCallId, ctx) {
		if (!extracted.uri.startsWith("todo://")) return null;
		// 恢复路径同样走边界校验：不合法 goal 视为不可恢复
		let parsed: ParsedTodo;
		try {
			parsed = todoScheme.parse(
				extracted.uri.slice("todo://".length),
				extracted.uri,
			);
		} catch {
			return null;
		}

		const call: PostToolCall = {
			id: toolCallId,
			tool: "post",
			args: { uri: extracted.uri, body: extracted.body },
		};
		const result = await writeTodo(call, parsed, ctx, "recovered");
		return { call, result };
	},
};
