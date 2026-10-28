/**
 * write 后端 — 文件创建/覆盖（`post` 的 write:// 分支）
 *
 * 通过声明式的方式直接输出目标文件完整内容，文件系统覆盖即完成。
 * 这比描述变更路径（"在第 N 行插入/删除/替换"）更安全、更确定。
 *
 * WriteToolResult 是四态判别联合（status 字段）：
 * - completed: 正常写入成功
 * - failed: 写入失败（IO 错误等）
 * - recovered: 从截断恢复后写入成功（内容不完整）
 * - recover_failed: 从截断恢复失败（参数无法解析）
 *
 * 结果统一携带 tool: "post"、scheme: "write" 与解析后的绝对 path。
 */

import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { PostToolCall, WriteToolResult } from "@n0n/types";
import type { PartialToolCall } from "./recovery.ts";
import { parsePostUri } from "./uri.ts";

/** 正常写入（非截断恢复） */
export async function writeTool(
	call: PostToolCall,
	workspace: string,
): Promise<WriteToolResult> {
	return writeFile(call, workspace, "completed");
}

/** 截断恢复写入（内容不完整） */
export async function writeToolRecovered(
	call: PostToolCall,
	workspace: string,
): Promise<WriteToolResult> {
	return writeFile(call, workspace, "recovered");
}

/** 统一写入实现，status 由调用方决定；内部从 call.args.uri 解析目标路径 */
export async function writeFile(
	call: PostToolCall,
	workspace: string,
	successStatus: "completed" | "recovered",
): Promise<WriteToolResult> {
	const parsed = parsePostUri(call.args.uri);
	if (parsed.scheme !== "write") {
		throw new Error(`writeFile: expected write:// uri, got "${call.args.uri}"`);
	}
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

// ── 截断恢复 ──

/**
 * 创建 file 后端的截断恢复函数（闭包绑定 workspace）。
 * 恢复参数 → 执行写入 → 返回 {call, result} 对。
 * 仅当提取出的 uri 解析为 write:// scheme 时才恢复；
 * exec/customer 的部分参数不可恢复，返回 null。
 */
export function makeFileRecover(workspace: string) {
	return async (
		partial: PartialToolCall,
	): Promise<{ call: PostToolCall; result: WriteToolResult } | null> => {
		const extracted = tryExtractPartialFile(partial.partialInput);
		if (!extracted) return null;

		try {
			if (parsePostUri(extracted.uri).scheme !== "write") return null;
		} catch {
			return null;
		}

		const call: PostToolCall = {
			id: partial.toolCallId,
			tool: "post",
			args: { uri: extracted.uri, body: extracted.body },
		};
		const result = await writeToolRecovered(call, workspace);
		return { call, result };
	};
}

/**
 * 尝试从截断的 post 工具 JSON 参数中提取 uri 和 body。
 *
 * post 参数格式为 {"uri":"...","body":"..."}。
 * 当 body 被 max_tokens 截断时，JSON 不完整，但 uri 和部分 body 仍可恢复。
 * 返回 null 表示无法提取（uri 未找到）。
 *
 * 注意：当前只处理基础 JSON 转义（\n \t \r \" \\），
 * 未处理 \uXXXX unicode 转义。目前未观测到实际问题。
 */
function tryExtractPartialFile(
	partialJson: string,
): { uri: string; body: string } | null {
	const uriMatch = partialJson.match(/"uri"\s*:\s*"((?:[^"\\]|\\.)*)"/);
	if (!uriMatch?.[1]) return null;

	const uri = uriMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
	if (!uri) return null;

	const bodyStart = partialJson.indexOf('"body"');
	if (bodyStart === -1) return { uri, body: "" };

	const valueStart = partialJson.indexOf('"', bodyStart + '"body"'.length + 1);
	if (valueStart === -1) return { uri, body: "" };

	// 从 body 值的开始引号之后扫描，寻找未转义的闭合引号
	const afterQuote = partialJson.slice(valueStart + 1);
	let rawBody: string;

	// 扫描闭合引号：逐字符检查，跳过 \" 转义
	let closeIdx = -1;
	for (let i = 0; i < afterQuote.length; i++) {
		if (afterQuote[i] === "\\") {
			i++;
			continue;
		} // 跳过转义字符
		if (afterQuote[i] === '"') {
			closeIdx = i;
			break;
		}
	}

	if (closeIdx !== -1) {
		// 找到闭合引号：截取引号之前的内容（完整 body 值）
		rawBody = afterQuote.slice(0, closeIdx);
	} else {
		// 未找到闭合引号：body 确实被截断，取到末尾并清理尾部不完整转义
		rawBody = afterQuote.replace(/\\?$/, "");
	}

	const body = rawBody
		.replace(/\\n/g, "\n")
		.replace(/\\t/g, "\t")
		.replace(/\\r/g, "\r")
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, "\\");

	return { uri, body };
}
