/**
 * CodeRenderer 流式 write 预览测试
 *
 * 验证 partial-json 解析下 path 锁定时机的正确性：
 * path 值必须在 content key 出现后才锁定，避免截断值导致垃圾文件。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolCallRecord } from "@n0n/types";
import { CodeRenderer } from "../code-renderer.ts";
import type { CodeShowResult } from "../schema.ts";
import { formatShowResult } from "../show-formatter.ts";

// ── 测试用临时目录 ──
const TEST_WORKSPACE = join(import.meta.dir, ".tmp-preview-test");
const TEST_SESSIONS = join(TEST_WORKSPACE, ".n0n", "sessions");
const TEST_SESSION = join(TEST_SESSIONS, "session-0001");
const TEST_PATHS = {
	workspace: TEST_WORKSPACE,
	n0n: join(TEST_WORKSPACE, ".n0n"),
	sessions: TEST_SESSIONS,
};
const TEST_RENDERER_OPTIONS = { sessionDir: TEST_SESSION };

function cleanup() {
	if (existsSync(TEST_WORKSPACE)) {
		rmSync(TEST_WORKSPACE, { recursive: true, force: true });
	}
}

/** 列出工作区中所有文件（递归） */
function listFiles(dir: string, prefix = ""): string[] {
	if (!existsSync(dir)) return [];
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const e of entries) {
		const rel = prefix ? `${prefix}/${e.name}` : e.name;
		if (e.isDirectory()) {
			files.push(...listFiles(join(dir, e.name), rel));
		} else {
			files.push(rel);
		}
	}
	return files;
}

// ── Mock stderr 避免终端输出 ──
const origWrite = process.stderr.write;
const origCols = process.stderr.columns;
const origTTY = process.stderr.isTTY;

beforeEach(() => {
	cleanup();
	mkdirSync(TEST_WORKSPACE, { recursive: true });
	process.stderr.write = () => true;
	Object.defineProperty(process.stderr, "isTTY", {
		value: false,
		writable: true,
		configurable: true,
	});
});

afterEach(() => {
	cleanup();
	process.stderr.write = origWrite;
	Object.defineProperty(process.stderr, "columns", {
		value: origCols,
		writable: true,
		configurable: true,
	});
	Object.defineProperty(process.stderr, "isTTY", {
		value: origTTY,
		writable: true,
		configurable: true,
	});
});

/** 模拟流式 tool call 参数传输 */
function simulateStream(
	renderer: CodeRenderer,
	index: number,
	toolName: string,
	chunks: string[],
	finalArgs?: Record<string, unknown>,
) {
	renderer.toolCallArgStart(index, toolName);
	for (const chunk of chunks) {
		renderer.toolCallArgChunk(index, chunk);
	}
	if (finalArgs) {
		renderer.toolCallArgEnd(index, {
			id: `call_${index}`,
			tool: toolName,
			args: finalArgs,
		} as ToolCallRecord);
	}
}

describe("CodeRenderer 流式 write 预览", () => {
	test("BUG 复现：path 不应在值未完整时被锁定", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		// 模拟 LLM 逐 chunk 输出 {"path": "tsconfig.json", "content": "{}"}
		simulateStream(
			renderer,
			0,
			"write",
			[
				'{"pa',
				'th": "ts', // partial-json 解析出 path:"ts"（截断！）
				"config.json",
				'", "content": "',
				"{}",
				'"}',
			],
			{ path: "tsconfig.json", content: "{}" },
		);

		const files = listFiles(TEST_WORKSPACE);
		expect(files).not.toContain("ts");
		expect(files).toContain("tsconfig.json");
	});

	test("path 在 content key 出现后才锁定", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		renderer.toolCallArgStart(0, "write");
		renderer.toolCallArgChunk(0, '{"path": "sr');
		renderer.toolCallArgChunk(0, "c/index.ts");

		// content 尚未出现，不应有文件
		expect(listFiles(TEST_WORKSPACE)).toEqual([]);

		renderer.toolCallArgChunk(0, '", "content": "hel');
		renderer.toolCallArgChunk(0, 'lo"');

		renderer.toolCallArgEnd(0, {
			id: "call_0",
			tool: "write",
			args: { path: "src/index.ts", content: "hello" },
		} satisfies ToolCallRecord);

		const files = listFiles(TEST_WORKSPACE);
		expect(files).not.toContain("sr");
		expect(files).toContain("src/index.ts");
	});

	test("非 write 工具不触发预览", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		simulateStream(renderer, 0, "observe", ['{"script": "echo hello"}'], {
			script: "echo hello",
		});

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("流中断时 path 未完整不写入", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		renderer.toolCallArgStart(0, "write");
		renderer.toolCallArgChunk(0, '{"path": "te');
		renderer.streamEnd();

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("aborted 时清理状态不触发额外写入", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		// path 和 content 都已出现，流式预览已触发写入
		renderer.toolCallArgStart(0, "write");
		renderer.toolCallArgChunk(0, '{"path": "test.txt", "content": "data"');

		// 此时 test.txt 已被流式写入（path+content 都完整）
		expect(listFiles(TEST_WORKSPACE)).toContain("test.txt");

		// aborted 只是清理内部状态，不会额外写入
		renderer.aborted();

		// 文件仍存在（已写入的不会被撤回），但状态已清理
		expect(listFiles(TEST_WORKSPACE)).toContain("test.txt");
	});
});

describe("formatShowResult 单元测试", () => {
	test("qualified delivery 仅 content", () => {
		const md = formatShowResult({
			type: "qualified delivery",
			content: "done",
		} satisfies CodeShowResult);
		expect(md).toContain("# ✅ 合格交付");
		expect(md).toContain("done");
	});

	test("production failed 完整 content", () => {
		const md = formatShowResult({
			type: "production failed",
			content: "无法完成",
		} satisfies CodeShowResult);
		expect(md).toContain("# ❌ 生产失败");
		expect(md).toContain("无法完成");
	});

	test("customer decision required 完整 content", () => {
		const md = formatShowResult({
			type: "customer decision required",
			content: "选哪个？\n## A\n影响A\n\n## B\n影响B",
		} satisfies CodeShowResult);
		expect(md).toContain("# ❓ 需要客户决定");
		expect(md).toContain("选哪个？");
		expect(md).toContain("## A");
		expect(md).toContain("## B");
	});

	test("customer information required 完整 content", () => {
		const md = formatShowResult({
			type: "customer information required",
			content: "需要帮助\n## 检查项1\n详情1\n\n## 检查项2\n详情2",
		} satisfies CodeShowResult);
		expect(md).toContain("# ❓ 需要客户信息");
		expect(md).toContain("## 检查项1");
		expect(md).toContain("## 检查项2");
	});
});
