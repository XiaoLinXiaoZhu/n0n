// biome-ignore-all lint/suspicious/noTemplateCurlyInString: literal test scripts
import { afterAll, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolvePlatform } from "@n0n/shared";
import type { ExecToolResult, ExecutionArtifactRef } from "@n0n/types";
import { ExecArgsSchema, execToolStream } from "../exec";

const pidsToCleanup: number[] = [];
const dirsToCleanup: string[] = [];
const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-exec-bg-"));

afterAll(() => {
	for (const pid of pidsToCleanup) {
		try {
			process.kill(pid, "SIGKILL");
		} catch {}
	}
	for (const dir of dirsToCleanup) {
		rmSync(dir, { recursive: true, force: true });
	}
});

async function collectResult(
	script: string,
	waitfor: number,
	runtime?: string,
): Promise<ExecToolResult> {
	const args = ExecArgsSchema.parse({ script, runtime, waitfor });
	for await (const event of execToolStream(
		{ id: "bg-sync-test", tool: "observe", args },
		undefined,
		{
			workspace: process.cwd(),
			tempDir: ".temp",
			sessionDir: SESSION_DIR,
			blocked_commands: [],
			default_exec_waitfor: waitfor,
			bgSyncIntervalMs: 100,
			platform: resolvePlatform(),
		},
	)) {
		if (event.type === "tool_result" && event.tool === "observe") return event;
	}
	throw new Error("No tool_result yielded");
}

function executionArtifact(result: ExecToolResult): ExecutionArtifactRef {
	expect(result.status).toBe("backgrounded");
	if (result.status !== "backgrounded") throw new Error("not backgrounded");
	expect(result.artifact.kind).toBe("execution");
	pidsToCleanup.push(result.pid);
	dirsToCleanup.push(result.artifact.runDir);
	return result.artifact;
}

describe("exec background artifact", () => {
	test("初始产物包含分离输出文件和 backgrounded 状态", async () => {
		const result = await collectResult("await Bun.sleep(2000);", 2, "bun");
		const artifact = executionArtifact(result);

		expect(existsSync(artifact.stdoutFile)).toBe(true);
		expect(existsSync(artifact.stderrFile)).toBe(true);
		const metadata = JSON.parse(readFileSync(artifact.resultFile, "utf8"));
		expect(metadata.status).toBe("backgrounded");
		expect(metadata.pid).toBe(
			result.status === "backgrounded" ? result.pid : 0,
		);
		expect(metadata.startedAt).toBeString();
		expect(metadata.updatedAt).toBeString();
	});

	test("heartbeat 只更新小型 result.json", async () => {
		const result = await collectResult("await Bun.sleep(5000);", 2, "bun");
		const artifact = executionArtifact(result);
		const stdoutMtime = statSync(artifact.stdoutFile).mtimeMs;
		const first = JSON.parse(readFileSync(artifact.resultFile, "utf8"));

		await new Promise((resolve) => setTimeout(resolve, 500));

		const second = JSON.parse(readFileSync(artifact.resultFile, "utf8"));
		expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(
			new Date(first.updatedAt).getTime(),
		);
		expect(statSync(artifact.stdoutFile).mtimeMs).toBe(stdoutMtime);
	});

	test("新输出直接 append，结束后 result.json 进入 exited", async () => {
		const script = [
			"for (let i = 1; i <= 4; i++) {",
			"  console.log(`output_line_${i}`);",
			"  await Bun.sleep(500);",
			"}",
		].join("\n");
		const result = await collectResult(script, 1, "bun");
		const artifact = executionArtifact(result);

		await new Promise((resolve) => setTimeout(resolve, 2500));

		const stdout = readFileSync(artifact.stdoutFile, "utf8");
		expect(stdout.match(/output_line_\d+/g)).toHaveLength(4);
		const metadata = JSON.parse(readFileSync(artifact.resultFile, "utf8"));
		expect(metadata.status).toBe("exited");
		expect(metadata.exitCode).toBe(0);
		expect(metadata.stdoutBytes).toBeGreaterThan(0);
		expect(metadata.endedAt).toBeString();
	});
});
