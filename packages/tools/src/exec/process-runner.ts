/**
 * ProcessRunner — 进程 spawn + 流泵 + waitfor 机制
 *
 * 将模型提供的脚本在子进程中执行，流式 yield 输出块，
 * 最终返回汇总结果（completed / backgrounded / error）。
 *
 * 等待机制使用 Promise.race（非 setTimeout → kill），
 * 确定性中断。等待超限后进程转入后台继续执行。
 *
 * 独立于 exec 工具的安全检测和输出格式化——仅负责进程生命周期管理。
 */

import type { ToolOutputChunk } from "@n0n/types";

// ── 类型 ──

export interface RunProcessOptions {
	spawnCmd: string[];
	cwd: string;
	waitforMs: number;
	callId: string;
	tool: string;
}

export interface RunProcessCompleted {
	outcome: "completed";
	stdout: string;
	stderr: string;
	exitCode: number;
	durationMs: number;
	stdoutChunks: string[];
	stderrChunks: string[];
}

export interface RunProcessBackgrounded {
	outcome: "backgrounded";
	stdoutSoFar: string;
	stderrSoFar: string;
	pid: number;
	durationMs: number;
	/** 持续变化的 stdout 桶（后台协程读取并同步到日志文件） */
	stdoutChunks: string[];
	/** 持续变化的 stderr 桶 */
	stderrChunks: string[];
	/** resolve 后表示两个流（stdout/stderr）均已读完 */
	streamsDone: Promise<void>;
	/** 子进程句柄（后台协程 await proc.exited） */
	proc: import("bun").Subprocess;
}

export interface RunProcessError {
	outcome: "error";
	error: string;
	durationMs: number;
}

export type RunProcessResult =
	| RunProcessCompleted
	| RunProcessBackgrounded
	| RunProcessError;

// ── runtime 工具 ──

/** runtime → 临时文件扩展名 */
export const RUNTIME_EXT: Record<string, string> = {
	sh: ".sh",
	bash: ".sh",
	cmd: ".cmd",
	pwsh: ".ps1",
	bun: ".ts",
	node: ".mjs",
	deno: ".ts",
	python: ".py",
	python3: ".py",
	uv: ".py",
};

/** runtime → 执行命令构造器 */
// DESIGN NOTE: buildSpawnCmd 用 switch 硬编码每个 runtime 的执行命令，
// 而非从某个 RuntimeProvider.spawnCmd() 动态获取。理由同 env.ts 顶部的
// DESIGN NOTE——runtime 列表稳定，且各 runtime 的 spawn 参数差异大
//（如 deno 需要 --allow-all，pwsh 需要 -NoProfile -File），
// 一个 switch 比一套接口 + 10 个实现文件更容易一眼看全。
// —— Mebius ∞
export function buildSpawnCmd(runtime: string, tmpFile: string): string[] {
	switch (runtime) {
		case "cmd":
			return ["cmd", "/c", tmpFile];
		case "sh":
		case "bash":
			return [runtime, tmpFile];
		case "pwsh":
			return ["pwsh", "-NoProfile", "-File", tmpFile];
		case "bun":
			return ["bun", "run", tmpFile];
		case "node":
			return ["node", tmpFile];
		case "deno":
			return ["deno", "run", "--allow-all", tmpFile];
		case "python":
		case "python3":
			return [runtime, tmpFile];
		case "uv":
			return ["uv", "run", tmpFile];
		default:
			return [runtime, tmpFile];
	}
}

// ── 执行入口 ──

/**
 * 流式执行子进程。
 *
 * Yield ToolOutputChunk 文本块，最终返回 RunProcessResult。
 * 调用方根据 result.outcome 决定后续处理（正常返回 / 截断写文件 / 后台日志）。
 */
export async function* runProcess(
	opts: RunProcessOptions,
): AsyncGenerator<ToolOutputChunk, RunProcessResult> {
	const { spawnCmd, cwd, waitforMs, callId, tool } = opts;
	const start = Date.now();

	try {
		const proc = Bun.spawn(spawnCmd, {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});

		const stdoutChunks: string[] = [];
		const stderrChunks: string[] = [];
		const decoder = new TextDecoder();

		const pending: ToolOutputChunk[] = [];
		let streamsDoneCount = 0;
		let resolveStreamsDone: () => void;
		const streamsDone = new Promise<void>((resolve) => {
			resolveStreamsDone = resolve;
		});
		let notify: (() => void) | null = null;

		const pumpStream = async (
			stream: ReadableStream<Uint8Array>,
			bucket: string[],
		) => {
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const text = decoder.decode(value, { stream: true });
					bucket.push(text);
					pending.push({
						type: "tool_output_chunk",
						callId,
						tool,
						chunk: text,
					});
					notify?.();
				}
			} finally {
				reader.releaseLock();
				streamsDoneCount++;
				if (streamsDoneCount === 2) resolveStreamsDone();
				notify?.();
			}
		};

		if (!proc.stdout || !proc.stderr) {
			throw new Error("Failed to capture process streams (stdout/stderr)");
		}
		pumpStream(proc.stdout, stdoutChunks);
		pumpStream(proc.stderr, stderrChunks);

		// ── 等待机制：Promise.race 确定性中断 ──
		let backgrounded = false;
		const waitforPromise = new Promise<"waitfor">((resolve) => {
			setTimeout(() => {
				backgrounded = true;
				resolve("waitfor");
			}, waitforMs);
		});

		while (streamsDoneCount < 2 || pending.length > 0) {
			if (backgrounded) break;
			if (pending.length === 0) {
				const waitForData = new Promise<"data">((r) => {
					notify = () => r("data");
				});
				const raceResult = await Promise.race([waitForData, waitforPromise]);
				notify = null;
				if (raceResult === "waitfor") break;
			}
			while (pending.length > 0) {
				const chunk = pending.shift();
				if (chunk) yield chunk;
			}
		}

		if (backgrounded) {
			const durationMs = Date.now() - start;
			return {
				outcome: "backgrounded",
				stdoutSoFar: stdoutChunks.join(""),
				stderrSoFar: stderrChunks.join(""),
				pid: proc.pid,
				durationMs,
				stdoutChunks,
				stderrChunks,
				streamsDone,
				proc,
			};
		}

		// ── 正常完成 ──
		const exitCode = await proc.exited;
		const durationMs = Date.now() - start;
		return {
			outcome: "completed",
			stdout: stdoutChunks.join(""),
			stderr: stderrChunks.join(""),
			exitCode,
			durationMs,
			stdoutChunks,
			stderrChunks,
		};
	} catch (err) {
		return {
			outcome: "error",
			error: err instanceof Error ? err.message : String(err),
			durationMs: Date.now() - start,
		};
	}
}
