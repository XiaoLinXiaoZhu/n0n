/**
 * write scheme — 文件创建/覆盖
 *
 * body 是文件的完整新状态，直接覆盖（不存在则创建），不描述变更路径：
 * 没有「只改某几行」的局部语义，任何编辑都提交整个文件。
 *
 * 结果四态（status 判别）：completed / failed / recovered / recover_failed，
 * 统一携带 scheme: "write" 与解析后的绝对 path。
 *
 * 调度事实：resourceKey = 目标路径 — 同路径串行，不同路径并行。
 * 恢复能力：支持。截断 body 原样写入并标记 recovered（内容不完整）。
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

/** 统一写入实现，status 由调用方决定；content 为最终落盘内容 */
async function writeFile(
  call: PostToolCall,
  filePath: string,
  content: string,
  successStatus: "completed" | "recovered",
): Promise<WriteToolResult> {
  try {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await Bun.write(filePath, content);
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

/** 绝对路径解析 */
function resolvePath(parsed: ParsedWrite, workspace: string): string {
  return isAbsolute(parsed.path)
    ? parsed.path
    : resolve(workspace, parsed.path);
}

export const writeScheme: SchemeHandler<ParsedWrite> = {
  scheme: "write",
  uriPrefix: "write://",
  bodyHint:
    "the file's complete new content for write:// — the body is the whole new state, not a diff or a fragment",

  describe() {
    return [
      "write — write://<path> . Body is the file's complete new state: the file is created if missing, or replaced in full if it exists. Paths are resolved relative to the workspace unless absolute. write:// takes no query parameters; the body is file content only, never parameter text. write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.",
    ];
  },

  parse(rest, fullUri) {
    // write:// 不接受 query；路径中的 ? 字面量需写 %3F。
    // query 键若被静默忽略，带损坏参数的目标会被当成合法路径写入。
    if (rest.includes("?")) {
      throw new Error(
        `Malformed write uri "${fullUri}". write:// takes no query parameters.`,
      );
    }
    const path = decodeSegment(rest);
    if (!path) {
      throw new Error(`Malformed write uri "${fullUri}". Missing path.`);
    }
    return { scheme: "write", path };
  },

  resourceKey: (parsed) => parsed.path,

  async *execute(parsed, call, ctx) {
    const filePath = resolvePath(parsed, ctx.workspace);
    yield await writeFile(call, filePath, call.args.body, "completed");
  },

  async recover(extracted, toolCallId, ctx): Promise<RecoveredExecute | null> {
    // 提取的 uri 可能属于其他 scheme（scheduler 不知道谁的参数被截断），
    // 此处只接管 write://；其余交还给注册表判 unrecoverable。
    if (!extracted.uri.startsWith("write://")) return null;
    // recover 是第二个边界：提取的 uri 同样走 parse；解析失败判 unrecoverable。
    let parsed: ParsedWrite;
    try {
      parsed = writeScheme.parse(
        extracted.uri.slice("write://".length),
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
    const result = await writeFile(
      call,
      resolvePath(parsed, ctx.workspace),
      extracted.body,
      "recovered",
    );
    return { call, result };
  },
};
