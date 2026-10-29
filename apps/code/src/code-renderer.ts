/**
 * CodeRenderer — code app 特化渲染器
 *
 * 继承 RichRenderer 的全部终端渲染能力，额外增加：
 * - post 工具 write:// 流式预览：在参数流式传输过程中，增量解析 partial JSON，
 *   仅当 uri 的字符串值已闭合、且解析为 write:// 全量写时，将已有的 body
 *   实时写入目标文件，让编辑器自动检测变化实现实时预览。
 *   exec:// 与 customer:// 不产生预览。
 *
 * 设计原则：
 * - 利用指令式事件模型，不新增 Renderer 接口
 * - 改动封闭在 code app 内，不影响核心包和其他 app
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

import { RichRenderer, type RichRendererOptions } from "@n0n/cli-ui";
import type { BaseWorkspacePaths } from "@n0n/shared";
import { parsePostUri } from "@n0n/tools";
import type { ToolCallRecord } from "@n0n/types";
import { parse as parsePartialJSON } from "partial-json";

/** 单个 post 工具调用的流式预览状态 */
interface PostPreview {
  /** 累积的 JSON 参数字符串 */
  args: string;
  /** 解析出的目标文件路径（仅 write:// uri）；uri 锁定后不再变化 */
  targetPath: string | null;
  /** uri 字符串值已闭合 → 锁定 targetPath，不再随流入更新（防截断值） */
  uriLocked: boolean;
  /** 上一次写入的 body 长度（用于去重，避免内容未变时重复写入） */
  lastContentLength: number;
  /** 上一次写入时间戳（用于节流） */
  lastWriteTime: number;
}

/** 写入节流间隔（ms）— 避免过于频繁的磁盘写入 */
const THROTTLE_MS = 100;

export interface CodeRendererOptions extends RichRendererOptions {
  /** 当前会话目录（write:// 预览不再需要临时目录，保留字段以兼容调用方） */
  sessionDir: string;
}

/** partial-json 解析出的 post 工具参数（字段可能不完整） */
function isPostPreviewArgs(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * partial JSON 中某个顶层 key 的字符串值是否已闭合。
 *
 * partial-json 会把被 chunk 截断的字符串值原样返回（`{"uri":"write://f`
 * 解析出 `write://f`），所以「能解析出 uri」不等于「uri 已完整」。窗口写的
 * `?prefix_lines=...` 往往落在下一个 chunk：若把裸路径当完整 uri，窗口写会被
 * 误判成全量写，body（初始为空串）随即覆盖目标文件 —— 确定性数据丢失。
 *
 * 这里扫描原始 args，确认该 key 对应的字符串存在闭合引号；字符串内部的
 * `"uri"` 只是普通字符，不会被误认为 key。
 */
function isTopLevelStringComplete(raw: string, key: string): boolean {
  const isSpace = (c: string | undefined) =>
    c === " " || c === "\n" || c === "\t" || c === "\r";

  let depth = 0;
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];

    if (ch !== '"') {
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      i++;
      continue;
    }

    // 读一个完整的 JSON 字符串 token
    const start = i + 1;
    i++;
    while (i < raw.length) {
      if (raw[i] === "\\") {
        i += 2;
      } else if (raw[i] === '"') {
        break;
      } else {
        i++;
      }
    }
    if (i >= raw.length) return false; // 字符串尚未闭合
    const token = raw.slice(start, i);
    i++; // 跳过闭合引号

    if (depth !== 1) continue;
    let j = i;
    while (isSpace(raw[j])) j++;
    if (raw[j] !== ":" || token !== key) continue; // 是值，或别的 key
    j++;
    while (isSpace(raw[j])) j++;
    if (raw[j] !== '"') return false;
    j++;
    while (j < raw.length) {
      if (raw[j] === "\\") {
        j += 2;
      } else if (raw[j] === '"') {
        return true;
      } else {
        j++;
      }
    }
    return false;
  }
  return false;
}

export class CodeRenderer extends RichRenderer {
  /** 活跃的 write:// 预览（index → preview state） */
  private previews = new Map<number, PostPreview>();

  constructor(
    private readonly paths: BaseWorkspacePaths,
    options: CodeRendererOptions,
  ) {
    super(options);
  }

  override toolCallArgStart(index: number, name: string): void {
    super.toolCallArgStart(index, name);
    if (name === "post") {
      this.previews.set(index, {
        args: "",
        targetPath: null,
        uriLocked: false,
        lastContentLength: -1,
        lastWriteTime: 0,
      });
    }
  }

  override toolCallArgChunk(index: number, chunk: string): void {
    super.toolCallArgChunk(index, chunk);

    const preview = this.previews.get(index);
    if (preview) {
      preview.args += chunk;
      this.flushPreview(index, preview, false);
    }
  }

  override toolCallArgEnd(index: number, tc: ToolCallRecord): void {
    super.toolCallArgEnd(index, tc);

    if (tc.tool === "post") {
      // 最终写入仅对 write:// uri 的全写模式；exec/customer 无文件落盘，
      // 窗口写（prefix_lines/suffix_lines）不预览——body 只是窗口片段，
      // 直接落盘会把整个文件替换成窗口片段（确定性损坏）。
      // （uri 畸形时静默跳过 — 该错误由工具执行侧转成 tool_arg_error）
      try {
        const parsed = parsePostUri(tc.args.uri);
        if (
          parsed.scheme === "write" &&
          parsed.prefixLines === 0 &&
          parsed.suffixLines === 0
        ) {
          this.writeFile(this.resolvePath(parsed.path), tc.args.body);
        }
      } catch {
        // 预览写入失败不应中断渲染流程
      }
    }
    this.previews.delete(index);
  }

  override streamEnd(): void {
    // 安全网：清理所有未完成的预览（如流被截断）
    for (const [index, preview] of this.previews.entries()) {
      this.flushPreview(index, preview, true);
    }
    this.previews.clear();
    super.streamEnd();
  }

  override aborted(): void {
    this.previews.clear();
    super.aborted();
  }

  // ── 内部方法 ──

  /**
   * 从累积的 partial JSON 中提取 uri/body，写入目标文件。
   * 仅当 uri 的字符串值已闭合、且解析为 write:// 全量写时预览；
   * 闭合后锁定 targetPath，避免截断的 uri 值产生垃圾文件。
   * @param force 是否强制写入（跳过节流，用于 streamEnd）
   */
  private flushPreview(
    _index: number,
    preview: PostPreview,
    force: boolean,
  ): void {
    const now = Date.now();
    if (!force && now - preview.lastWriteTime < THROTTLE_MS) return;

    let parsed: Record<string, unknown> | null = null;
    try {
      const result = parsePartialJSON(preview.args);
      if (isPostPreviewArgs(result)) {
        parsed = result;
      }
    } catch {
      return;
    }
    if (!parsed) return;

    const uriStr =
      typeof parsed.uri === "string" && parsed.uri.length > 0
        ? parsed.uri
        : undefined;
    const bodyStr = typeof parsed.body === "string" ? parsed.body : undefined;

    // 只有 uri 的字符串值已闭合才做预览决定：被 chunk 截断的裸路径同样
    // 能被 partial-json 解析成合法 uri，此刻锁定会把窗口写误判成全量写。
    if (!preview.uriLocked && isTopLevelStringComplete(preview.args, "uri")) {
      preview.uriLocked = true;
      if (uriStr !== undefined) {
        try {
          const parsedUri = parsePostUri(uriStr);
          // 窗口写不预览：流式 body 只是窗口片段，落盘即损坏整个文件
          if (
            parsedUri.scheme === "write" &&
            parsedUri.prefixLines === 0 &&
            parsedUri.suffixLines === 0
          ) {
            preview.targetPath = this.resolvePath(parsedUri.path);
          }
        } catch {
          // uri 完整但畸形/不支持的 scheme：不预览，错误交由执行侧报出
        }
      }
    }

    // 写入：仅 write://（targetPath 存在）且 body 已到达
    if (bodyStr !== undefined && preview.targetPath) {
      if (bodyStr.length !== preview.lastContentLength) {
        preview.lastContentLength = bodyStr.length;
        preview.lastWriteTime = now;
        this.writeFile(preview.targetPath, bodyStr);
      }
    }
  }

  private resolvePath(p: string): string {
    return isAbsolute(p) ? p : resolve(this.paths.workspace, p);
  }

  private writeFile(filePath: string, content: string): void {
    try {
      const dir = dirname(filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(filePath, content, "utf-8");
    } catch {
      // 预览写入失败不应中断渲染流程
    }
  }
}
