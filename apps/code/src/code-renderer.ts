/**
 * CodeRenderer — code app 特化渲染器
 *
 * 继承 RichRenderer 的全部终端渲染能力，额外增加：
 * - post 工具 write:// 流式预览：在参数流式传输过程中，增量解析 partial JSON，
 *   仅当 uri 解析为 write:// scheme 时，将已有的 body 实时写入目标文件，
 *   让编辑器自动检测变化实现实时预览。exec:// 与 customer:// 不产生预览。
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
	/** body 字段已出现 → uri 锁定，不再更新 targetPath（防截断值产生垃圾文件） */
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
			// 最终写入仅对 write:// uri；exec/customer 无文件落盘
			// （uri 畸形时静默跳过 — 该错误由工具执行侧转成 tool_arg_error）
			try {
				const parsed = parsePostUri(tc.args.uri);
				if (parsed.scheme === "write") {
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
	 * 仅当 uri 可解析为 write:// scheme 时预览；target path 取解析后的 path，
	 * body 出现后 uri 锁定，避免截断的 uri 值产生垃圾文件。
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

		// uri 未锁定时，随流入持续解析；只有 write:// 才参与预览。
		// body 出现时 uri 已完整（uri key 先于 body 到达），此刻锁定。
		if (!preview.uriLocked && uriStr !== undefined) {
			try {
				const parsedUri = parsePostUri(uriStr);
				if (parsedUri.scheme === "write") {
					preview.targetPath = this.resolvePath(parsedUri.path);
				}
			} catch {
				// uri 尚未完整或不支持的 scheme — 保持现状，等待更多数据
			}
		}
		if (!preview.uriLocked && bodyStr !== undefined) {
			preview.uriLocked = true;
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
