/**
 * Workspace 路径工具 — 通用路径解析与目录管理
 *
 * 提供最小路径集（BaseWorkspacePaths）和通用工具函数。
 * 路径解析为纯函数，无全局状态。
 *
 * 扩展路径集（如 WorkflowPaths）由各业务包自行定义。
 */

import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

// ── 类型 ──

/** 所有模式共享的最小路径集 */
export interface BaseWorkspacePaths {
	/** 工作区根目录（绝对路径） */
	workspace: string;
	/** 临时文件目录 */
	temp: string;
}

// ── 平台 ──

/**
 * 返回当前运行时平台，类型收窄为已知值。
 * 非 win32/darwin/linux 时抛出（不支持）。
 */
export function resolvePlatform(): "win32" | "darwin" | "linux" {
	const p = process.platform;
	if (p === "win32" || p === "darwin" || p === "linux") return p;
	throw new Error(`Unsupported platform: ${p}`);
}

// ── 路径解析（纯函数）──

/** 解析 base 路径 — 最小路径集 */
export function resolveBasePaths(workspace: string): BaseWorkspacePaths {
	const ws = resolve(workspace);
	return {
		workspace: ws,
		temp: resolve(ws, ".temp"),
	};
}

// ── 目录创建 ──

/** 确保路径对象中所有目录存在 — 只创建传入对象中实际存在的字段 */
export function ensureDirs<T extends BaseWorkspacePaths>(paths: T): void {
	for (const dir of Object.values(paths)) {
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
	}
}

/** 创建并返回递增编号的 session 目录。 */
export function createSessionDir(tempDir: string): string {
	mkdirSync(tempDir, { recursive: true });
	const existing = readdirSync(tempDir)
		.filter((name) => /^session-\d+$/.test(name))
		.map((name) => Number.parseInt(name.slice("session-".length), 10))
		.filter(Number.isFinite);
	const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
	const sessionDir = resolve(
		tempDir,
		`session-${String(next).padStart(4, "0")}`,
	);
	mkdirSync(sessionDir, { recursive: true });
	return sessionDir;
}

// ── CLI 参数解析 ──

/**
 * 从命令行参数中解析 --workspace 选项。
 * 返回解析后的 workspace 绝对路径和剩余参数。
 *
 * 支持三种指定方式（优先级从高到低）：
 * 1. `--workspace <dir>` 显式指定
 * 2. 裸路径参数（拖拽文件/文件夹到 exe 时自动传入）
 *    - 文件夹 → 直接作为 workspace
 *    - 文件 → 取其所在目录作为 workspace
 * 3. 环境变量 / 默认值
 */
export function parseWorkspaceArg(
	args: string[],
	envKey: string,
	defaultPath: string,
): { workspace: string; remainingArgs: string[] } {
	const remaining = [...args];
	const idx = remaining.indexOf("--workspace");
	let workspaceValue: string | undefined;

	if (idx >= 0) {
		// 显式 --workspace 参数
		workspaceValue = remaining[idx + 1];
		if (!workspaceValue) {
			throw new Error("--workspace requires a directory argument");
		}
		remaining.splice(idx, 2);
	} else if (remaining.length > 0 && !remaining[0]?.startsWith("-")) {
		// 裸路径参数（支持拖拽文件/文件夹到 exe）
		const first = remaining[0] as string;
		const candidate = resolve(first);
		if (existsSync(candidate)) {
			const stat = statSync(candidate);
			workspaceValue = stat.isDirectory() ? candidate : dirname(candidate);
			remaining.splice(0, 1);
		}
	}

	const workspace = resolve(
		workspaceValue ?? process.env[envKey] ?? defaultPath,
	);

	return { workspace, remainingArgs: remaining };
}
