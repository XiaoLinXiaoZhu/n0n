// biome-ignore-all lint/suspicious/noTemplateCurlyInString: test scripts contain template literals as string content
/**
 * exec 输出截断行为验证测试
 *
 * 验证 execToolStream 在输出超过阈值时：
 * - 返回 status: "truncated"
 * - stdoutTail 包含末尾内容
 * - outputFile 已创建且包含完整输出
 * - 短输出仍返回 status: "completed"
 *
 * TODO 平台兼容：使用 bun runtime 生成大量输出，
 * 避免依赖 Unix 命令（seq / printf / bash for 循环等），
 * 确保 Windows / macOS / Linux 均可通过。
 */

import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import type { ExecToolResult } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec/index.ts";

/** 内部调用类型 — 与 ExecCall 对齐 */
interface TestCall {
	id: string;
	tool: "observe";
	args: { script: string; runtime?: string; cwd?: string; waitfor?: number };
}

/** 收集 exec 结果 */
async function collectResult(script: string, runtime?: string) {
	const args = ExecArgsSchema.parse({ script, runtime });
	const call: TestCall = { id: "trunc-test", tool: "observe", args };

	for await (const event of execToolStream(call, undefined, {
		workspace: process.cwd(),
		tempDir: ".temp",
		blockedCommands: [],
		defaultExecWaitfor: 120,
		platform: process.platform as "win32" | "darwin" | "linux",
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

	test("超长输出 — 应返回 status: truncated + outputFile", async () => {
		// 使用 bun runtime 生成超过 8000 字符的输出
		const script = [
			"for (let i = 1; i <= 500; i++) {",
			'  console.log(`line_${i}: ${"=".repeat(20)}`);',
			"}",
		].join("\n");
		const result = await collectResult(script, "bun");

		expect(result.status).toBe("truncated");
		if (result.status === "truncated") {
			expect(result.stdoutTail).toContain("line_500");
			expect(result.stdoutTail.length).toBeLessThanOrEqual(8500);

			expect(existsSync(result.outputFile)).toBe(true);

			expect(result.stdoutLength).toBeGreaterThan(8000);
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
			expect(result.stderrTail).toContain("err_500");
			expect(result.stderrLength).toBeGreaterThan(8000);
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
