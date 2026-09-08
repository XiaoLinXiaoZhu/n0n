// runCommand 的真实 stdin/超时行为由 packages/shared/src/__tests__/run-command.test.ts
// 用真实子进程验证；这里只验证 context-env 的并发、顺序与接线。
import { describe, expect, test } from "bun:test";
import type { RunCommandFn, RunCommandOptions } from "@n0n/shared";
import { buildEnvironmentContext } from "../context-env.ts";

interface RecordedCall {
	cmd: string[];
	options: RunCommandOptions | undefined;
	startedAt: number;
}

const calls: RecordedCall[] = [];

const fakeRunCommand: RunCommandFn = async (cmd, options) => {
	calls.push({ cmd: [...cmd], options, startedAt: performance.now() });
	await Bun.sleep(50);
	return {
		stdout: `out:${cmd.slice(1).join(" ")}`,
		stderr: "",
		exitCode: 0,
	};
};

describe("buildEnvironmentContext", () => {
	test("三个 CLI 调用并发执行并保持 section 顺序", async () => {
		calls.length = 0;
		const result = await buildEnvironmentContext("E:/tmp", {
			runCommandFn: fakeRunCommand,
		});

		expect(calls).toHaveLength(3);
		expect(calls.map((call) => call.cmd.join(" "))).toEqual([
			"n0n scan global",
			"n0n scan project",
			"n0n skill",
		]);

		for (const call of calls) {
			expect(call.options?.cwd).toBe("E:/tmp");
			expect(call.options?.timeoutMs).toBe(15_000);
		}

		const startedAt = calls.map((call) => call.startedAt);
		const spread = Math.max(...startedAt) - Math.min(...startedAt);
		expect(spread).toBeLessThan(20);

		expect(result).toContain("执行 n0n scan global 的结果为：");
		expect(result).toContain("out:scan global");
		expect(result.indexOf("out:scan global")).toBeLessThan(
			result.indexOf("out:scan project"),
		);
		expect(result.indexOf("out:scan project")).toBeLessThan(
			result.indexOf("out:skill"),
		);
	});
});
