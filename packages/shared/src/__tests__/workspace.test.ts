import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createSessionDir, resolveBasePaths } from "../workspace.ts";

const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

describe("resolveBasePaths", () => {
	test("将运行时文件集中在工作区 .n0n 目录下", () => {
		const workspace = resolve("/project");

		expect(resolveBasePaths(workspace)).toEqual({
			workspace,
			n0n: resolve(workspace, ".n0n"),
			sessions: resolve(workspace, ".n0n", "sessions"),
		});
	});

	test("并发创建时每个进程都获得唯一 session 目录", async () => {
		const sessionsDir = mkdtempSync(resolve(tmpdir(), "n0n-sessions-"));
		tempDirs.push(sessionsDir);
		const workspaceModule = resolve(import.meta.dir, "../workspace.ts");
		const script = `
			import { createSessionDir } from ${JSON.stringify(workspaceModule)};
			console.log(createSessionDir(${JSON.stringify(sessionsDir)}));
		`;

		const processes = Array.from({ length: 12 }, () =>
			Bun.spawn([process.execPath, "--eval", script], {
				stdout: "pipe",
				stderr: "pipe",
			}),
		);
		const dirs = await Promise.all(
			processes.map(async (child) => {
				const output = await new Response(child.stdout).text();
				const error = await new Response(child.stderr).text();
				const exitCode = await child.exited;
				if (exitCode !== 0) throw new Error(error);
				return output.trim();
			}),
		);

		expect(new Set(dirs).size).toBe(dirs.length);
	});
});
