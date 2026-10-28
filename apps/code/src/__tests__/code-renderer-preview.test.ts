/**
 * CodeRenderer 流式 write:// 预览测试
 *
 * 验证 partial-json 解析下 uri/body 锁定时机的正确性：
 * uri 值必须在 body key 出现后才锁定，避免截断值产生垃圾文件；
 * 仅 write:// scheme 触发预览，exec:// 与 customer:// 不落盘。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { ToolCallRecord } from "@n0n/types";
import { CodeRenderer } from "../code-renderer.ts";

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

describe("CodeRenderer 流式 write:// 预览", () => {
	test("BUG 复现：uri 不应在值未完整时被锁定", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		// 模拟 LLM 逐 chunk 输出 {"uri": "write://tsconfig.json", "body": "{}"}
		simulateStream(
			renderer,
			0,
			"post",
			[
				'{"ur',
				'i": "write://ts', // partial-json 解析出 uri:"write://ts"（截断！）
				"config.json",
				'", "body": "',
				"{}",
				'"}',
			],
			{ uri: "write://tsconfig.json", body: "{}" },
		);

		const files = listFiles(TEST_WORKSPACE);
		expect(files).not.toContain("ts");
		expect(files).toContain("tsconfig.json");
	});

	test("uri 在 body key 出现后才锁定", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		renderer.toolCallArgStart(0, "post");
		renderer.toolCallArgChunk(0, '{"uri": "write://sr');
		renderer.toolCallArgChunk(0, "c/index.ts");

		// body 尚未出现，不应有文件
		expect(listFiles(TEST_WORKSPACE)).toEqual([]);

		renderer.toolCallArgChunk(0, '", "body": "hel');
		renderer.toolCallArgChunk(0, 'lo"');

		renderer.toolCallArgEnd(0, {
			id: "call_0",
			tool: "post",
			args: { uri: "write://src/index.ts", body: "hello" },
		} satisfies ToolCallRecord);

		const files = listFiles(TEST_WORKSPACE);
		expect(files).not.toContain("sr");
		expect(files).toContain("src/index.ts");
	});

	test("exec:// uri 不触发预览", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		simulateStream(
			renderer,
			0,
			"post",
			['{"uri": "exec://sh/probe", "body": "echo hello"}'],
			{ uri: "exec://sh/probe", body: "echo hello" },
		);

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("customer:// uri 不触发预览", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		simulateStream(
			renderer,
			0,
			"post",
			['{"uri": "customer://question", "body": "A or B?"}'],
			{ uri: "customer://question", body: "A or B?" },
		);

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("非 post 工具不触发预览", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		simulateStream(
			renderer,
			0,
			"other",
			['{"uri": "write://x.txt", "body": "b"}'],
			{
				uri: "write://x.txt",
				body: "b",
			},
		);

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("流中断时 uri 未完整不写入", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		renderer.toolCallArgStart(0, "post");
		renderer.toolCallArgChunk(0, '{"uri": "write://te');
		renderer.streamEnd();

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});

	test("aborted 时清理状态不触发额外写入", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		// uri 和 body 都已出现，流式预览已触发写入
		renderer.toolCallArgStart(0, "post");
		renderer.toolCallArgChunk(0, '{"uri": "write://test.txt", "body": "data"');

		// 此时 test.txt 已被流式写入（uri+body 都完整）
		expect(listFiles(TEST_WORKSPACE)).toContain("test.txt");

		// aborted 只是清理内部状态，不会额外写入
		renderer.aborted();

		// 文件仍存在（已写入的不会被撤回），但状态已清理
		expect(listFiles(TEST_WORKSPACE)).toContain("test.txt");
	});

	test("畸形 uri 的最终调用不落盘", () => {
		const renderer = new CodeRenderer(TEST_PATHS, TEST_RENDERER_OPTIONS);

		renderer.toolCallArgStart(0, "post");
		renderer.toolCallArgEnd(0, {
			id: "call_0",
			tool: "post",
			args: { uri: "bogus://x", body: "data" },
		} satisfies ToolCallRecord);

		expect(listFiles(TEST_WORKSPACE)).toEqual([]);
	});
});
