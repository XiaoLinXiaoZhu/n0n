// biome-ignore-all lint/suspicious/noTemplateCurlyInString: test scripts contain template literals as string content
/**
 * exec waitfor 行为验证测试
 *
 * 验证 execToolStream 在脚本等待超限后能正确返回 backgrounded 结果，
 * 而不是卡死。使用 Promise.race 硬超时保护防止测试进程挂起。
 */

import { describe, expect, test } from "bun:test";
import type { ExecToolResult } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec/index.ts";

/** 内部调用类型 — 与 ExecCall 对齐 */
interface TestCall {
	id: string;
	tool: "observe";
	args: { script: string; runtime?: string; cwd?: string; waitfor?: number };
}

/** 收集 exec 流式输出，带硬超时保护 */
async function collectWithHardTimeout(
	script: string,
	execWaitfor: number,
	hardTimeoutMs: number,
	runtime?: string,
): Promise<
	| { status: "completed"; result: ExecToolResult }
	| { status: "hung"; elapsedMs: number }
> {
	const args = ExecArgsSchema.parse({ script, runtime, waitfor: execWaitfor });
	const call: TestCall = { id: "waitfor-test", tool: "observe", args };
	const start = Date.now();

	const execPromise = (async () => {
		for await (const event of execToolStream(call, undefined, {
			workspace: process.cwd(),
			tempDir: ".temp",
			blocked_commands: [],
			default_exec_waitfor: execWaitfor,
			platform: process.platform as "win32" | "darwin" | "linux",
		})) {
			if (event.type === "tool_result" && event.tool === "observe") {
				return { status: "completed" as const, result: event };
			}
		}
		throw new Error("No tool_result yielded");
	})();

	const hardTimeout = new Promise<{ status: "hung"; elapsedMs: number }>(
		(resolve) => {
			setTimeout(() => {
				resolve({ status: "hung", elapsedMs: Date.now() - start });
			}, hardTimeoutMs);
		},
	);

	return Promise.race([execPromise, hardTimeout]);
}

describe("exec waitfor 行为验证", () => {
	test("正常脚本在 waitfor 内完成 — 应返回正常结果", async () => {
		const outcome = await collectWithHardTimeout("echo hello", 10, 5000);
		expect(outcome.status).toBe("completed");
		if (
			outcome.status === "completed" &&
			outcome.result.status === "completed"
		) {
			expect(outcome.result.exitCode).toBe(0);
			expect(outcome.result.stdout.trim()).toBe("hello");
		}
	});

	test("阻塞脚本超过 waitfor — 应返回 backgrounded 结果而非卡死", async () => {
		const outcome = await collectWithHardTimeout(
			"await Bun.sleep(30000);",
			2,
			8000,
			"bun",
		);

		expect(outcome.status).toBe("completed");
		if (outcome.status === "completed") {
			expect(outcome.result.status === "backgrounded").toBe(true);
			if (outcome.result.status === "backgrounded") {
				expect(outcome.result.pid).toBeGreaterThan(0);
				expect(outcome.result.logFile).toContain("exec_bg_");
				try {
					process.kill(outcome.result.pid, "SIGKILL");
				} catch {}
			}
		}
	}, 15000);

	test("shell fork 子进程场景 — 应返回 backgrounded 结果而非卡死", async () => {
		const script = [
			'const proc = Bun.spawn(["bun", "-e", "await Bun.sleep(30000)"], { stdout: "inherit" });',
			"await proc.exited;",
		].join("\n");
		const outcome = await collectWithHardTimeout(script, 2, 8000, "bun");

		expect(outcome.status).toBe("completed");
		if (outcome.status === "completed") {
			expect(outcome.result.status === "backgrounded").toBe(true);
			if (outcome.result.status === "backgrounded") {
				try {
					process.kill(outcome.result.pid, "SIGKILL");
				} catch {}
			}
		}
	}, 15000);

	test("有持续输出的脚本等待超限 — 应捕获超限前的部分输出", async () => {
		const script = [
			"for (let i = 1; i <= 10; i++) {",
			"  console.log(`line_${i}`);",
			"  await Bun.sleep(500);",
			"}",
		].join("\n");
		const outcome = await collectWithHardTimeout(script, 2, 8000, "bun");

		expect(outcome.status).toBe("completed");
		if (outcome.status === "completed") {
			expect(outcome.result.status === "backgrounded").toBe(true);
			if (outcome.result.status === "backgrounded") {
				const lines = outcome.result.stdoutSoFar
					.trim()
					.split("\n")
					.filter(Boolean);
				expect(lines.length).toBeGreaterThanOrEqual(2);
				expect(lines.length).toBeLessThanOrEqual(5);
				try {
					process.kill(outcome.result.pid, "SIGKILL");
				} catch {}
			}
		}
	}, 15000);
});
