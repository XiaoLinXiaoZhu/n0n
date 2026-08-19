// biome-ignore-all lint/suspicious/noTemplateCurlyInString: test scripts contain template literals as string content
/**
 * exec 工具测试
 *
 * 验证 script+runtime 模式下的脚本执行：
 * - 默认 runtime（平台 shell）执行简单命令
 * - bun runtime 执行 TypeScript 代码
 * - 转义字符在文件执行模式下不再是问题
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePlatform } from "@n0n/shared";
import { ExecArgsSchema, execToolStream } from "../exec";

/** 内部调用类型 — 与 ExecCall 对齐，用于测试 */
interface TestCall {
	id: string;
	tool: "observe";
	args: { script: string; runtime?: string; cwd?: string; waitfor?: number };
}

const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-exec-escape-"));

/** 收集 exec 流式输出的最终结果 */
async function collectExecResult(script: string, runtime?: string) {
	const args = ExecArgsSchema.parse({ script, runtime });
	const call: TestCall = { id: "test-id", tool: "observe", args };
	let stdout = "";
	let stderr = "";
	let exitCode = -1;

	for await (const event of execToolStream(call, undefined, {
		workspace: process.cwd(),
		sessionDir: SESSION_DIR,
		blocked_commands: [],
		default_exec_waitfor: 120,
		max_exec_output_tokens: 32_000,
		platform: resolvePlatform(),
	})) {
		if (
			event.type === "tool_result" &&
			event.tool === "observe" &&
			event.status === "completed"
		) {
			stdout = event.stdout;
			stderr = event.stderr;
			exitCode = event.exitCode;
		}
	}
	return { stdout, stderr, exitCode };
}

describe("exec tool — script+runtime model", () => {
	test("simple command with default runtime (platform shell)", async () => {
		const result = await collectExecResult("echo hello");
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("hello");
	});

	test("bun runtime executes TypeScript", async () => {
		const result = await collectExecResult('console.log("from bun")', "bun");
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("from bun");
	});

	test("bun runtime with multi-line script", async () => {
		const script = ["const a = 1;", "const b = 2;", "console.log(a + b);"].join(
			"\n",
		);
		const result = await collectExecResult(script, "bun");
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("3");
	});

	test("bun runtime with string containing newlines (no escape issues)", async () => {
		const script = `const s = 'a\\nb'; console.log(s.split('\\n').length);`;
		const result = await collectExecResult(script, "bun");
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toBe("2");
	});

	test("bun runtime with imports", async () => {
		const script = [
			'import { join } from "node:path";',
			'console.log(join("a", "b"));',
		].join("\n");
		const result = await collectExecResult(script, "bun");
		expect(result.exitCode).toBe(0);
		expect(result.stdout.trim()).toMatch(/a[/\\]b/);
	});

	test("non-zero exit code is captured", async () => {
		const result = await collectExecResult("process.exit(42)", "bun");
		expect(result.exitCode).toBe(42);
	});
});
