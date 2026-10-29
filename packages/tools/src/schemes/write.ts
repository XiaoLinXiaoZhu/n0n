/**
 * write scheme — 文件创建/覆盖（支持 prefix/suffix 窗口写入，FIM 式）
 *
 * body 是窗口/文件的新状态，不描述变更路径：
 * - 无 query 或 prefix_lines = suffix_lines = 0：body 是完整文件，直接覆盖；
 * - 带 prefix_lines/suffix_lines：body = 未变前缀行 + 新内容 + 未变后缀行，
 *   锚行必须与磁盘精确一致（fail-not-guess，无 fuzz），只替换窗口中间。
 *
 * 行模型：body/文件均按行切分（剥行尾 \r 与一个末尾换行——末行换行是
 * body 属性而非一行，不做补全），拼接与写盘统一 LF。
 *
 * 结果四态（status 判别）：completed / failed / recovered / recover_failed，
 * 统一携带 scheme: "write" 与解析后的绝对 path。
 *
 * 调度事实：resourceKey = 目标路径 — 同路径串行（窗口/全文件两种粒度同路径
 * 自动串行），不同路径并行。
 * 恢复能力：支持。全写截断 body 原样写入；窗口模式同样走匹配-拼接
 * （截断的 content 作为部分新状态拼入）；锚段无法识别时判 unrecoverable——
 * 严禁把窗口截断 body 当完整文件写入（确定性损坏）。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import type {
  PostToolCall,
  ToolArgErrorMessage,
  WriteToolResult,
} from "@n0n/types";

import { decodeSegment } from "./parse-utils.ts";
import type { RecoveredExecute, SchemeHandler } from "./types.ts";

/** write:// 的解析产物 */
export interface ParsedWrite {
  scheme: "write";
  /** URL 解码后的文件路径 */
  path: string;
  /** 窗口前缀行数（未变锚行）；0 = 无前缀 */
  prefixLines: number;
  /** 窗口后缀行数（未变锚行）；0 = 无后缀 */
  suffixLines: number;
}

/** 窗口拼接结果：成功 = 新文件内容，失败 = 带修复指引的错误消息 */
type WindowResult =
  { ok: true; content: string } | { ok: false; message: string };

/** 修复指引——context 不匹配的错误消息必须包含（教模型修复方向） */
const ANCHOR_GUIDANCE =
  "context lines must be unchanged — they are anchors. Put all changed lines inside the window: enlarge prefix_lines/suffix_lines to cover them. (file changed since your read? re-read and retry)";

/**
 * 按行切分；剥掉行尾 \r（容忍 CRLF），剥掉一个末尾换行（其后不计行）。
 * 末行换行是 body 的属性而非一行——"a\nb\n" 是 2 行，
 * 由 toLines().trailingNewline 记录，拼接时按 body 决定是否补回。
 */
function toLines(s: string): { lines: string[]; trailingNewline: boolean } {
  if (s === "") return { lines: [], trailingNewline: false };
  const trailingNewline = s.endsWith("\n");
  const core = trailingNewline ? s.slice(0, -1) : s;
  const lines = core
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l));
  return { lines, trailingNewline };
}

/** haystack[from..from+needle.length) 与 needle 逐行相等 */
function sliceEquals(
  haystack: string[],
  from: number,
  needle: string[],
): boolean {
  for (let k = 0; k < needle.length; k++) {
    if (haystack[from + k] !== needle[k]) return false;
  }
  return true;
}

/** 展示文件在某处的实际行（空文件特判） */
function describeLines(fileContent: string, lines: string[]): string {
  if (!fileContent) return "(empty file)";
  return lines.length > 0 ? lines.join("\n") : "(end of file)";
}

/**
 * 窗口匹配 + 拼接（精确匹配，无 fuzz）。
 *
 * 找 prefix 段的全部出现；对每个出现，从其下一行向后找 suffix 段的首个出现。
 * 恰好一对 → 替换窗口中间为 content；零对/多对 → 报错（附磁盘实际内容/消歧指引）。
 * P = 0 时前缀锚定文件头（唯一出现位 0）；S = 0 时后缀锚定 EOF。
 */
function applyWindow(
  fileContent: string,
  body: string,
  P: number,
  S: number,
): WindowResult {
  const { lines: bodyLines, trailingNewline } = toLines(body);
  if (bodyLines.length < P + S) {
    return {
      ok: false,
      message: `body has ${bodyLines.length} line(s) but prefix_lines + suffix_lines = ${P + S}. A windowed body must contain the ${P} unchanged prefix line(s), then the new content, then the ${S} unchanged suffix line(s).`,
    };
  }
  const { lines: fileLines } = toLines(fileContent);
  const prefix = bodyLines.slice(0, P);
  const suffix = bodyLines.slice(bodyLines.length - S);
  const content = bodyLines.slice(P, bodyLines.length - S);

  // prefix 出现位置（P = 0：空 prefix 唯一锚定文件头）
  const prefixAts: number[] = [];
  if (P === 0) {
    prefixAts.push(0);
  } else {
    for (let i = 0; i + P <= fileLines.length; i++) {
      if (sliceEquals(fileLines, i, prefix)) prefixAts.push(i);
    }
  }

  // 每个 prefix 出现向后找 suffix 首个出现，收集 (窗口中间起点, 后缀起点)
  const pairs: Array<{ midStart: number; suffixStart: number }> = [];
  for (const i of prefixAts) {
    if (S === 0) {
      pairs.push({ midStart: i + P, suffixStart: fileLines.length });
      continue;
    }
    for (let j = i + P; j + S <= fileLines.length; j++) {
      if (sliceEquals(fileLines, j, suffix)) {
        pairs.push({ midStart: i + P, suffixStart: j });
        break;
      }
    }
  }

  const pair = pairs[0];
  if (pairs.length === 1 && pair) {
    const { midStart, suffixStart } = pair;
    // 旧中间 = [midStart, suffixStart)，替换为 content；
    // suffix 及其后原样保留（suffix 与 body 末 S 行恒等，行尾 CR 已剥离）
    const out = [
      ...fileLines.slice(0, midStart),
      ...content,
      ...fileLines.slice(suffixStart),
    ];
    // 末行换行由 body 自带内容决定，不做补全
    return {
      ok: true,
      content: out.join("\n") + (trailingNewline ? "\n" : ""),
    };
  }

  if (pairs.length > 1) {
    return {
      ok: false,
      message: `Ambiguous window: the prefix/suffix anchor pair matches ${pairs.length} times in the file. Enlarge prefix_lines/suffix_lines so the window matches exactly once.`,
    };
  }

  // 零对——附上磁盘实际内容，让模型一眼看到不匹配原因
  if (P === 0) {
    return {
      ok: false,
      message: `${ANCHOR_GUIDANCE}\nThe suffix (${S} line(s)) does not occur in the file. The file actually starts with:\n${describeLines(fileContent, fileLines.slice(0, Math.max(S, 1)))}`,
    };
  }
  if (prefixAts.length === 0) {
    return {
      ok: false,
      message: `${ANCHOR_GUIDANCE}\nThe prefix (${P} line(s)) does not occur in the file. The file actually starts with:\n${describeLines(fileContent, fileLines.slice(0, Math.max(P, 1)))}`,
    };
  }
  const lastAt = prefixAts[prefixAts.length - 1] ?? 0;
  return {
    ok: false,
    message: `${ANCHOR_GUIDANCE}\nThe prefix matches, but no unchanged ${S}-line suffix follows it. The file actually continues (from line ${lastAt + P + 1}) with:\n${describeLines(fileContent, fileLines.slice(lastAt + P, lastAt + P + Math.max(S, 1)))}`,
  };
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

/** 绝对路径解析（window 与 full 共用） */
function resolvePath(parsed: ParsedWrite, workspace: string): string {
  return isAbsolute(parsed.path)
    ? parsed.path
    : resolve(workspace, parsed.path);
}

/** body/uri 参数错误 → tool_arg_error（path 指向出错参数） */
function argError(callId: string, path: string, message: string) {
  const error: ToolArgErrorMessage = {
    type: "tool_arg_error",
    callId,
    tool: "post",
    error: { kind: "invalid_args", issues: [{ path, message }] },
  };
  return error;
}

/** query 中 prefix_lines/suffix_lines 的非负整数校验；非法即 throw（边界即解析） */
function parseWindowCount(raw: string, key: string, fullUri: string): number {
  const value = decodeSegment(raw);
  if (!/^\d+$/.test(value)) {
    throw new Error(
      `Malformed write uri "${fullUri}". ${key} must be a non-negative integer.`,
    );
  }
  return Number(value);
}

export const writeScheme: SchemeHandler<ParsedWrite> = {
  scheme: "write",
  uriPrefix: "write://",
  bodyHint:
    "the new file state for write:// (complete file by default; editing an existing file takes the window form via prefix_lines/suffix_lines — file content only, never parameter text)",

  describe() {
    return [
      "write — write://<path>?prefix_lines=P&suffix_lines=S . P/S are uri query parameters — they belong after `?` in the uri; the body is file content only, never parameter text. Body is the new state: the complete file by default (both zero/omitted); windowed, the window's new state — fill-in-the-middle: P unchanged anchor lines copied verbatim from the file, then the new content (those lines as they end up, not a diff), then S unchanged anchor lines (P and S are independent counts). Editing an existing file is the windowed case — only the lines between the anchors are replaced and every other line is written back unchanged, so a local edit needs no scripted whole-file rewrite; a full write is for creating a file or replacing all of it. Example: to rewrite line 3 of a 5-line file — write://f.txt?prefix_lines=2&suffix_lines=2, body = the file's lines 1-2, then the replacement line, then its lines 4-5. Anchors must match the file exactly and match only once: a body shorter than P+S lines, no match, or several matches is rejected and nothing is written — enlarge the window to cover all changed lines (or to disambiguate) and retry. The body's trailing newline decides the file's: end the body with a newline to keep one. write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.",
    ];
  },

  parse(rest, fullUri) {
    // 首个裸 ? 切开 query（路径中的 ? 字面量写 %3F），path 随后 URL 解码
    const q = rest.indexOf("?");
    const rawPath = q === -1 ? rest : rest.slice(0, q);
    const path = decodeSegment(rawPath);
    if (!path) {
      throw new Error(`Malformed write uri "${fullUri}". Missing path.`);
    }

    let prefixLines = 0;
    let suffixLines = 0;
    if (q !== -1) {
      for (const pair of rest.slice(q + 1).split("&")) {
        if (!pair) continue;
        const eq = pair.indexOf("=");
        const key = eq === -1 ? pair : pair.slice(0, eq);
        const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
        if (key === "prefix_lines") {
          prefixLines = parseWindowCount(rawValue, key, fullUri);
        } else if (key === "suffix_lines") {
          suffixLines = parseWindowCount(rawValue, key, fullUri);
        } else {
          // write 的 query 键错误若被忽略，会把窗口写静默降级成全量覆盖
          // （确定性损坏）——fail-not-guess，直接拒绝
          throw new Error(
            `Malformed write uri "${fullUri}". Unknown query parameter "${key}" — supported: prefix_lines, suffix_lines.`,
          );
        }
      }
    }
    return { scheme: "write", path, prefixLines, suffixLines };
  },

  resourceKey: (parsed) => parsed.path,

  async *execute(parsed, call, ctx) {
    const filePath = resolvePath(parsed, ctx.workspace);
    const { prefixLines: P, suffixLines: S } = parsed;

    // 全写：body = 完整文件，无匹配直接替换
    if (P === 0 && S === 0) {
      yield await writeFile(call, filePath, call.args.body, "completed");
      return;
    }

    // 窗口模式：需要已存在的文件作锚
    let fileContent: string;
    try {
      fileContent = readFileSync(filePath, "utf8");
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        yield argError(
          call.id,
          "uri",
          `Windowed write needs an existing file to anchor against, but ${filePath} does not exist. Create the file with a full write first (omit prefix_lines/suffix_lines).`,
        );
        return;
      }
      yield {
        type: "tool_result",
        tool: "post",
        call,
        status: "failed",
        scheme: "write",
        path: filePath,
        error: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    const result = applyWindow(fileContent, call.args.body, P, S);
    if (!result.ok) {
      yield argError(call.id, "body", result.message);
      return;
    }
    yield await writeFile(call, filePath, result.content, "completed");
  },

  async recover(extracted, toolCallId, ctx): Promise<RecoveredExecute | null> {
    // 提取的 uri 可能属于其他 scheme（scheduler 不知道谁的参数被截断），
    // 此处只接管 write://；其余交还给注册表判 unrecoverable。
    if (!extracted.uri.startsWith("write://")) return null;
    // recover 是第二个边界：提取的 uri 同样可能带 query，按与 execute
    // 相同的语义解析；解析失败（含非法 query）判 unrecoverable。
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
    const filePath = resolvePath(parsed, ctx.workspace);
    const { prefixLines: P, suffixLines: S } = parsed;

    // 全写：截断 body 原样写入（保持现状）
    if (P === 0 && S === 0) {
      const result = await writeFile(
        call,
        filePath,
        extracted.body,
        "recovered",
      );
      return { call, result };
    }

    // 窗口模式：截断的 content 作为部分新状态拼入；锚段无法识别
    // （body 少于 P+S 行 / 匹配失败 / 文件不存在）时判 unrecoverable——
    // 严禁把窗口截断 body 当完整文件写入。
    let fileContent: string;
    try {
      fileContent = readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
    const result = applyWindow(fileContent, extracted.body, P, S);
    if (!result.ok) return null;
    const written = await writeFile(
      call,
      filePath,
      result.content,
      "recovered",
    );
    return { call, result: written };
  },
};
