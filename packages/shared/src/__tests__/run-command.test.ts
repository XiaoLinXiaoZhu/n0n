import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { RunCommandError, runCommand } from "../process.ts";

function fixture(name: string): string {
	return join(import.meta.dir, "fixtures", name);
}

describe("runCommand", () => {
	test("stdin 固定为 ignore，子进程立即读到 EOF", async () => {
		const result = await runCommand(
			[process.execPath, fixture("stdin-echo.ts")],
			{ timeoutMs: 5_000 },
		);
		expect(result.stdout.trim()).toBe("EOF:");
		expect(result.exitCode).toBe(0);
	});

	test("超时会杀掉子进程并抛出 RunCommandError", async () => {
		const start = performance.now();
		const error = await runCommand([process.execPath, fixture("sleep.ts")], {
			timeoutMs: 300,
		}).catch((err: unknown) => err);
		expect(error).toBeInstanceOf(RunCommandError);
		expect((error as RunCommandError).timedOut).toBe(true);
		expect(performance.now() - start).toBeLessThan(5_000);
	});

	test("AbortSignal 会中止子进程", async () => {
		const controller = new AbortController();
		setTimeout(() => controller.abort(), 100);
		const error = await runCommand([process.execPath, fixture("sleep.ts")], {
			signal: controller.signal,
			timeoutMs: 5_000,
		}).catch((err: unknown) => err);
		expect(error).toBeInstanceOf(RunCommandError);
		expect((error as RunCommandError).aborted).toBe(true);
	});
});
