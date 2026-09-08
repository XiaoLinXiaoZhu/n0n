// runCommand 的真实 stdin/超时行为由 packages/shared/src/__tests__/run-command.test.ts
// 用真实子进程验证；这里只验证 runtime 探测的并发与接线。
import { describe, expect, test } from "bun:test";
import type { RunCommandFn, RunCommandOptions } from "@n0n/shared";

interface RecordedProbe {
	cmd: string[];
	options: RunCommandOptions | undefined;
	startedAt: number;
}

const probes: RecordedProbe[] = [];

const fakeRunCommand: RunCommandFn = async (cmd, options) => {
	probes.push({ cmd: [...cmd], options, startedAt: performance.now() });
	await Bun.sleep(50);
	return { stdout: `version-output:${cmd[0]}`, stderr: "", exitCode: 0 };
};

const { probeRuntimes } = await import("../commands/global.ts");

describe("scan global", () => {
	test("运行时探测并发执行", async () => {
		probes.length = 0;
		await probeRuntimes(fakeRunCommand);

		expect(probes).toHaveLength(8);

		const startedAt = probes.map((probe) => probe.startedAt);
		const spread = Math.max(...startedAt) - Math.min(...startedAt);
		expect(spread).toBeLessThan(20);

		const commands = probes.map((probe) => probe.cmd[0]);
		for (const expected of ["bash", "pwsh", "bun", "node", "uv"]) {
			expect(commands).toContain(expected);
		}
		expect(commands).toContain(
			process.platform === "win32" ? "python" : "python3",
		);

		for (const probe of probes) {
			expect(probe.options?.timeoutMs).toBe(5000);
		}
	});
});
