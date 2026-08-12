import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI_PATH = resolve(__dirname, "../main.ts");
const WORKSPACE = resolve(__dirname, "../../../..");

interface CliResult {
	status: number | null;
	stdout: string;
	stderr: string;
}

function runCli(args: string[]): CliResult {
	const result = spawnSync("bun", [CLI_PATH, ...args], {
		cwd: WORKSPACE,
		encoding: "utf8",
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

function pipeCli(args: string[], input: string): CliResult {
	const result = spawnSync("bun", [CLI_PATH, ...args], {
		cwd: WORKSPACE,
		encoding: "utf8",
		input,
	});
	return {
		status: result.status,
		stdout: result.stdout,
		stderr: result.stderr,
	};
}

describe("n0n CLI integration", () => {
	test("--help 展示统一命令", () => {
		const result = runCli(["--help"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("scan");
		expect(result.stdout).toContain("skill");
		expect(result.stdout).toContain("config");
		expect(result.stdout).toContain("env");
		expect(result.stdout).toContain("read");
		expect(result.stdout).not.toContain("agent [");
		expect(result.stdout).not.toContain("init ");
	});

	test("--version 正常退出", () => {
		const result = runCli(["--version"]);

		expect(result.status).toBe(0);
		expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
	});

	test("不存在的裸参数展示错误和 help", () => {
		const input = "definitely-not-a-command-or-path";
		const result = runCli([input]);

		expect(result.status).toBe(1);
		expect(result.stderr).toContain(`未知命令或路径不存在: ${input}`);
		expect(result.stdout).toContain("Usage: n0n");
	});

	test("未注册的 init 和 agent 不会回退为 prompt", () => {
		for (const command of ["init", "agent"]) {
			const result = runCli([command]);
			expect(result.status).toBe(1);
			expect(result.stderr).toContain(`未知命令或路径不存在: ${command}`);
			expect(result.stdout).toContain("Usage: n0n");
		}
	});

	test("scan project 可通过统一入口执行", () => {
		const result = runCli(["scan", "project"]);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("[Workspace]");
	});

	test("read 保持 stdout 可管道组合，导航元数据写入 stderr", () => {
		const input = "alpha beta gamma delta ".repeat(200);
		const result = pipeCli(["read", "--tokens", "20"], input);

		expect(result.status).toBe(0);
		expect(input.startsWith(result.stdout)).toBe(true);
		expect(result.stdout).not.toContain("nextCursor");
		const metadata = JSON.parse(result.stderr.trim());
		expect(metadata.tokens).toBeLessThanOrEqual(20);
		expect(metadata.nextCursor).toBeGreaterThan(0);
		expect(metadata.eof).toBe(false);
	});
});
