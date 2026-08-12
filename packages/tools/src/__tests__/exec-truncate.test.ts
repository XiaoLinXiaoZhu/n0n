// biome-ignore-all lint/suspicious/noTemplateCurlyInString: test scripts contain template literals as string content
/**
 * exec 输出截断行为验证测试
 *
 * 验证 execToolStream 在输出超过阈值时：
 * - 返回 status: "truncated"
 * - stdoutPreview 同时包含头部和末尾内容
 * - execution artifact 已创建且包含完整输出
 * - 短输出仍返回 status: "completed"
 *
 * TODO 平台兼容：使用 bun runtime 生成大量输出，
 * 避免依赖 Unix 命令（seq / printf / bash for 循环等），
 * 确保 Windows / macOS / Linux 均可通过。
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { estimateTokens, resolvePlatform } from "@n0n/shared";
import type { ExecToolResult } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec";

/** 内部调用类型 — 与 ExecCall 对齐 */
interface TestCall {
	id: string;
	tool: "observe";
	args: {
		script: string;
		runtime?: string;
		cwd?: string;
		waitfor?: number;
		output_tokens?: number;
	};
}

const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-exec-truncate-"));

/** 收集 exec 结果 */
async function collectResult(
	script: string,
	runtime?: string,
	outputTokens?: number,
) {
	const args = ExecArgsSchema.parse({
		script,
		runtime,
		output_tokens: outputTokens,
	});
	const call: TestCall = { id: "trunc-test", tool: "observe", args };

	for await (const event of execToolStream(call, undefined, {
		workspace: process.cwd(),
		tempDir: ".temp",
		sessionDir: SESSION_DIR,
		blocked_commands: [],
		default_exec_waitfor: 120,
		max_exec_output_tokens: 32_000,
		platform: resolvePlatform(),
	})) {
		if (event.type === "tool_result" && event.tool === "observe") {
			return event as ExecToolResult;
		}
	}
	throw new Error("No tool_result yielded");
}

describe("exec 输出截断", () => {
	test("短输出 — 应返回 status: completed", async () => {
		const result = await collectResult("echo hello");
		expect(result.status).toBe("completed");
		if (result.status === "completed") {
			expect(result.stdout.trim()).toBe("hello");
		}
	});

	test("超长输出 — 应返回 status: truncated + artifact", async () => {
		// 使用 bun runtime 生成超过 8000 字符的输出
		const script = [
			"for (let i = 1; i <= 500; i++) {",
			'  console.log(`line_${i}: ${"=".repeat(20)}`);',
			"}",
		].join("\n");
		const result = await collectResult(script, "bun");

		expect(result.status).toBe("truncated");
		if (result.status === "truncated") {
			expect(result.stdoutPreview).toContain("line_1");
			expect(result.stdoutPreview).toContain("line_500");
			expect(estimateTokens(result.stdoutPreview)).toBeLessThanOrEqual(
				result.outputTokenBudget,
			);

			expect(result.artifact.kind).toBe("execution");
			expect(existsSync(result.artifact.stdoutFile)).toBe(true);
			expect(existsSync(result.artifact.stderrFile)).toBe(true);
			expect(existsSync(result.artifact.resultFile)).toBe(true);

			expect(result.stdoutLength).toBeGreaterThan(8000);
			expect(result.totalEstimatedTokens).toBeGreaterThan(
				result.outputTokenBudget,
			);
			expect(result.exitCode).toBe(0);
		}
	});

	test("超长 stderr — 应返回 status: truncated", async () => {
		const script = [
			"for (let i = 1; i <= 500; i++) {",
			'  console.error(`err_${i}: ${"=".repeat(20)}`);',
			"}",
		].join("\n");
		const result = await collectResult(script, "bun");

		expect(result.status).toBe("truncated");
		if (result.status === "truncated") {
			expect(result.stderrPreview).toContain("err_1");
			expect(result.stderrPreview).toContain("err_500");
			expect(result.stderrLength).toBeGreaterThan(8000);
		}
	});

	test("提高 output_tokens 后中等输出一次完整返回", async () => {
		const script = [
			"for (let i = 1; i <= 700; i++) {",
			'  console.log(`full_${i}: ${"x".repeat(20)}`);',
			"}",
		].join("\n");
		const result = await collectResult(script, "bun", 10_000);
		expect(result.status).toBe("completed");
		if (result.status === "completed") {
			expect(result.stdout).toContain("full_1");
			expect(result.stdout).toContain("full_700");
		}
	});

	test("恰好在阈值内 — 应返回 status: completed", async () => {
		const script = [
			"for (let i = 1; i <= 300; i++) {",
			"  console.log(`short_line_${i}_padding`);",
			"}",
		].join("\n");
		const result = await collectResult(script, "bun");

		expect(result.status).toBe("completed");
		if (result.status === "completed") {
			expect(result.stdout).toContain("short_line_300");
		}
	});
});
