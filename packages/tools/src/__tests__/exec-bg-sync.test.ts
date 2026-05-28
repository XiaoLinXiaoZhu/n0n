/**
 * exec 后台同步行为验证测试
 *
 * 验证 backgrounded 进程的 bg 文件：
 * 1. 初始写入时包含正确的元数据（PID、status: running、started_at、last_updated）
 * 2. 定期更新 last_updated 时间戳（即使无新输出）
 * 3. 进程结束后写入终态元数据（exit_code、ended_at、duration）
 * 4. 新输出能被同步到 bg 文件
 */

import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import type { ExecToolResult } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec/index.ts";

/** 内部调用类型 — 与 ExecCall 对齐 */
interface TestCall {
	id: string;
	tool: "observe";
	args: { script: string; runtime?: string; cwd?: string; waitfor?: number };
}

const pidsToCleanup: number[] = [];
const filesToCleanup: string[] = [];

afterAll(() => {
	for (const pid of pidsToCleanup) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	for (const file of filesToCleanup) {
		try {
			unlinkSync(file);
		} catch {}
	}
});

/** 收集 exec 结果 */
async function collectResult(
	script: string,
	execWaitfor: number,
	runtime?: string,
): Promise<ExecToolResult> {
	const args = ExecArgsSchema.parse({ script, runtime, waitfor: execWaitfor });
	const call: TestCall = { id: "bg-sync-test", tool: "observe", args };
	for await (const event of execToolStream(call, undefined, {
		workspace: process.cwd(),
		tempDir: ".temp",
		blocked_commands: [],
		default_exec_waitfor: execWaitfor,
		platform: process.platform as "win32" | "darwin" | "linux",
	})) {
		if (event.type === "tool_result" && event.tool === "observe") {
			return event as ExecToolResult;
		}
	}
	throw new Error("No tool_result yielded");
}

describe("exec bg 文件同步验证", () => {
	test("bg 文件初始写入包含 running 状态和元数据", async () => {
		const result = await collectResult("await Bun.sleep(15000);", 2, "bun");

		expect(result.status).toBe("backgrounded");
		if (result.status !== "backgrounded") return;

		pidsToCleanup.push(result.pid);
		filesToCleanup.push(result.logFile);

		expect(existsSync(result.logFile)).toBe(true);
		const content = readFileSync(result.logFile, "utf-8");

		expect(content).toContain("--- exec_bg_meta ---");
		expect(content).toContain(`pid: ${result.pid}`);
		expect(content).toContain("status: running");
		expect(content).toContain("started_at:");
		expect(content).toContain("last_updated:");
		expect(content).toContain("note:");
		expect(content).toContain("--- stdout ---");
		expect(content).toContain("--- stderr ---");
	}, 10000);

	test("bg 文件定期更新 last_updated（即使无新输出）", async () => {
		const result = await collectResult("await Bun.sleep(20000);", 2, "bun");

		expect(result.status).toBe("backgrounded");
		if (result.status !== "backgrounded") return;

		pidsToCleanup.push(result.pid);
		filesToCleanup.push(result.logFile);

		const content1 = readFileSync(result.logFile, "utf-8");
		const match1 = content1.match(/last_updated: (.+)/);
		expect(match1).not.toBeNull();
		const time1 = new Date(match1![1]!).getTime();

		await new Promise((r) => setTimeout(r, 4000));

		const content2 = readFileSync(result.logFile, "utf-8");
		const match2 = content2.match(/last_updated: (.+)/);
		expect(match2).not.toBeNull();
		const time2 = new Date(match2![1]!).getTime();

		expect(time2 - time1).toBeGreaterThanOrEqual(2000);
		expect(content2).toContain("status: running");
	}, 15000);

	test("进程结束后 bg 文件包含终态元数据", async () => {
		const result = await collectResult(
			'await Bun.sleep(3000); console.log("done");',
			1,
			"bun",
		);

		expect(result.status).toBe("backgrounded");
		if (result.status !== "backgrounded") return;

		pidsToCleanup.push(result.pid);
		filesToCleanup.push(result.logFile);

		await new Promise((r) => setTimeout(r, 5000));

		const content = readFileSync(result.logFile, "utf-8");

		expect(content).toContain("status: exited");
		expect(content).toContain("exit_code: 0");
		expect(content).toContain("ended_at:");
		expect(content).toContain("duration:");
		expect(content).toContain("last_updated:");
		expect(content).toContain("done");
		expect(content).not.toContain("note:");
	}, 12000);

	test("新输出能被同步到 bg 文件", async () => {
		const script = [
			"for (let i = 1; i <= 8; i++) {",
			"  console.log(`output_line_${i}`);",
			"  await Bun.sleep(1000);",
			"}",
		].join("\n");
		const result = await collectResult(script, 2, "bun");

		expect(result.status).toBe("backgrounded");
		if (result.status !== "backgrounded") return;

		pidsToCleanup.push(result.pid);
		filesToCleanup.push(result.logFile);

		await new Promise((r) => setTimeout(r, 5000));

		const content = readFileSync(result.logFile, "utf-8");
		const lineMatches = content.match(/output_line_\d+/g) || [];
		expect(lineMatches.length).toBeGreaterThanOrEqual(4);
	}, 15000);

	test("bg 文件 mtime 在进程运行期间持续推进", async () => {
		const script = [
			"for (let i = 1; i <= 12; i++) {",
			"  console.log(`[t=${i}s] heartbeat`);",
			"  await Bun.sleep(1000);",
			"}",
		].join("\n");
		const result = await collectResult(script, 2, "bun");

		expect(result.status).toBe("backgrounded");
		if (result.status !== "backgrounded") return;

		pidsToCleanup.push(result.pid);
		filesToCleanup.push(result.logFile);

		const mtimes: number[] = [];
		for (let i = 0; i < 3; i++) {
			await new Promise((r) => setTimeout(r, 3500));
			const stat = Bun.file(result.logFile);
			mtimes.push(stat.lastModified);
		}

		expect(mtimes[1]!).toBeGreaterThan(mtimes[0]!);
		expect(mtimes[2]!).toBeGreaterThan(mtimes[1]!);

		await new Promise((r) => setTimeout(r, 4000));
		const content = readFileSync(result.logFile, "utf-8");
		expect(content).toContain("status: exited");
		const heartbeats = (content.match(/heartbeat/g) || []).length;
		expect(heartbeats).toBe(12);
	}, 25000);
});
