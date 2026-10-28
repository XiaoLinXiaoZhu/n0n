/**
 * write scheme — 文件创建/覆盖
 *
 * body 是目标文件的完整内容。通过声明式方式直接输出完整文件，
 * 比描述变更路径（"第 N 行插入/删除/替换"）更安全、更确定。
 *
 * 结果四态（status 判别）：completed / failed / recovered / recover_failed，
 * 统一携带 scheme: "write" 与解析后的绝对 path。
 *
 * 调度事实：resourceKey = 目标路径 — 同路径串行，不同路径并行。
 * 恢复能力：支持（截断的 uri+body 提取后仍写入，标记 recovered）。
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { PostToolCall, WriteToolResult } from "@n0n/types";
import { decodeSegment } from "./parse-utils.ts";
import type { RecoveredExecute, SchemeHandler } from "./types.ts";

/** write:// 的解析产物 */
export interface ParsedWrite {
	scheme: "write";
	/** URL 解码后的文件路径 */
	path: string;
}

/** 统一写入实现，status 由调用方决定；path 已由边界解析 */
async function writeFile(
	call: PostToolCall,
	parsed: ParsedWrite,
	workspace: string,
	successStatus: "completed" | "recovered",
): Promise<WriteToolResult> {
	const filePath = isAbsolute(parsed.path)
		? parsed.path
		: resolve(workspace, parsed.path);

	try {
		const dir = dirname(filePath);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		await Bun.write(filePath, call.args.body);
		return {
			type: "tool_result",
			tool: "post",
			call,
			status: successStatus,
			scheme: "write",
			path: filePath,
		};
	} catch (err) {
		// 截断恢复写入也可能失败（权限等），统一用 recover_failed 或 failed
		const errorStatus =
			successStatus === "recovered" ? "recover_failed" : "failed";
		return {
			type: "tool_result",
			tool: "post",
			call,
			status: errorStatus,
			scheme: "write",
			path: filePath,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export const writeScheme: SchemeHandler<ParsedWrite> = {
	scheme: "write",
	uriPrefix: "write://",
	bodyHint: "the complete file content for write://",

	describe() {
		return [
			"write — write://<path> . Body is the complete file content; the file is created or overwritten at <path> (relative paths resolve against the workspace root). write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.",
		];
	},

	parse(rest, fullUri) {
		// write:// 之后全部是路径（URL 解码），无 query 语义
		const path = decodeSegment(rest);
		if (!path) {
			throw new Error(`Malformed write uri "${fullUri}". Missing path.`);
		}
		return { scheme: "write", path };
	},

	resourceKey: (parsed) => parsed.path,

	async *execute(parsed, call, ctx) {
		yield await writeFile(call, parsed, ctx.workspace, "completed");
	},

	async recover(extracted, toolCallId, ctx): Promise<RecoveredExecute | null> {
		// 提取的 uri 可能属于其他 scheme（scheduler 不知道谁的参数被截断），
		// 此处只接管 write://；其余交还给注册表判 unrecoverable。
		if (!extracted.uri.startsWith("write://")) return null;
		const parsed: ParsedWrite = {
			scheme: "write",
			path: decodeSegment(extracted.uri.slice("write://".length)),
		};
		if (!parsed.path) return null;

		const call: PostToolCall = {
			id: toolCallId,
			tool: "post",
			args: { uri: extracted.uri, body: extracted.body },
		};
		const result = await writeFile(call, parsed, ctx.workspace, "recovered");
		return { call, result };
	},
};
