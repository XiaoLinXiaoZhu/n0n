/**
 * exec run id 分配验证 — 会话内递增序号。
 *
 * runId 应为 4 位递增序号（0001、0002…），直接作为 runs 目录名；
 * 每次分配基于 runs 目录现有最大序号 +1，目录创建即占用（mkdir 原子性）。
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePlatform } from "@n0n/shared";
import type { ExecToolResult } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec";

const pidsToCleanup: number[] = [];
const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-exec-runid-"));

afterAll(() => {
	for (const pid of pidsToCleanup) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	rmSync(SESSION_DIR, { recursive: true, force: true });
});

async function collectBackgrounded(script: string): Promise<ExecToolResult> {
	const args = ExecArgsSchema.parse({
		script,
		runtime: "bun",
		waitfor: 1,
		cwd: SESSION_DIR,
	});
	for await (const event of execToolStream(
		{ id: "runid-test-call", tool: "observe", args },
		undefined,
		{
			workspace: process.cwd(),
			sessionDir: SESSION_DIR,
			blocked_commands: [],
			default_exec_waitfor: 1,
			max_exec_output_tokens: 32_000,
			platform: resolvePlatform(),
		},
	)) {
		if (event.type === "tool_result" && event.tool === "observe") return event;
	}
	throw new Error("No tool_result yielded");
}

describe("exec run id 分配", () => {
	test("会话内 run id 应从 0001 递增且不含调用方 id", async () => {
		const first = await collectBackgrounded("await Bun.sleep(2000);");
		expect(first.status).toBe("backgrounded");
		if (first.status !== "backgrounded") throw new Error("not backgrounded");
		pidsToCleanup.push(first.pid);

		expect(first.artifact.runId).toMatch(/^\d{4}$/);
		expect(first.artifact.runId).toBe("0001");
		expect(first.artifact.runDir).toBe(
			join(SESSION_DIR, "exec", "runs", first.artifact.runId),
		);
		const metadata = JSON.parse(
			readFileSync(first.artifact.resultFile, "utf8"),
		);
		expect(metadata.runId).toBe("0001");

		const second = await collectBackgrounded("await Bun.sleep(2000);");
		expect(second.status).toBe("backgrounded");
		if (second.status !== "backgrounded") throw new Error("not backgrounded");
		pidsToCleanup.push(second.pid);

		expect(second.artifact.runId).toBe("0002");

		expect(readdirSync(join(SESSION_DIR, "exec", "runs")).sort()).toEqual([
			"0001",
			"0002",
		]);
	});
});
