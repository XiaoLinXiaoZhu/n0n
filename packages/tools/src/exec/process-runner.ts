/**
 * ProcessRunner — 进程 spawn、流泵和 waitfor。
 *
 * 完整 stdout/stderr 直接追加到 execution artifact；内存只保留有界 capture
 * 与 tail，因此大输出和后台进程的内存占用不随输出总量增长。
 */

import { appendFileSync } from "node:fs";
import type { ToolOutputChunk } from "@n0n/types";

export interface RunProcessOptions {
	spawnCmd: string[];
	cwd: string;
	waitforMs: number;
	callId: string;
	tool: string;
	stdoutFile: string;
	stderrFile: string;
}

export interface StreamCapture {
	/** 仅当 complete=true 时包含完整流内容。 */
	content: string;
	complete: boolean;
	tail: string;
	charLength: number;
	byteLength: number;
	lines: number;
}

export interface RunProcessCompleted {
	outcome: "completed";
	stdout: StreamCapture;
	stderr: StreamCapture;
	exitCode: number;
	durationMs: number;
}

export interface RunProcessBackgrounded {
	outcome: "backgrounded";
	stdout: StreamCapture;
	stderr: StreamCapture;
	pid: number;
	durationMs: number;
	streamsDone: Promise<void>;
	proc: import("bun").Subprocess;
	captures: () => { stdout: StreamCapture; stderr: StreamCapture };
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

const CAPTURE_LIMIT_CHARS = 256 * 1024;
const TAIL_LIMIT_CHARS = 256 * 1024;

class BoundedStreamCapture {
	private content = "";
	private complete = true;
	private tail = "";
	private charLength = 0;
	private byteLength = 0;
	private newlines = 0;

	push(text: string): void {
		this.charLength += text.length;
		this.byteLength += Buffer.byteLength(text, "utf8");
		for (let i = 0; i < text.length; i++) {
			if (text[i] === "\n") this.newlines++;
		}

		if (this.complete) {
			if (this.content.length + text.length <= CAPTURE_LIMIT_CHARS) {
				this.content += text;
			} else {
				this.content = "";
				this.complete = false;
			}
		}

		this.tail = (this.tail + text).slice(-TAIL_LIMIT_CHARS);
	}

	snapshot(): StreamCapture {
		return {
			content: this.content,
			complete: this.complete,
			tail: this.tail,
			charLength: this.charLength,
			byteLength: this.byteLength,
			lines: this.newlines + 1,
		};
	}
}

export async function* runProcess(
	opts: RunProcessOptions,
): AsyncGenerator<ToolOutputChunk, RunProcessResult> {
	const { spawnCmd, cwd, waitforMs, callId, tool, stdoutFile, stderrFile } =
		opts;
	const start = Date.now();

	try {
		const proc = Bun.spawn(spawnCmd, {
			cwd,
			stdout: "pipe",
			stderr: "pipe",
			env: { ...process.env },
		});
		if (!proc.stdout || !proc.stderr) {
			throw new Error("Failed to capture process streams (stdout/stderr)");
		}

		const stdout = new BoundedStreamCapture();
		const stderr = new BoundedStreamCapture();
		const pending: ToolOutputChunk[] = [];
		const MAX_PENDING_CHUNKS = 32;
		let streamsDoneCount = 0;
		let resolveStreamsDone: () => void;
		const streamsDone = new Promise<void>((resolve) => {
			resolveStreamsDone = resolve;
		});
		let notify: (() => void) | null = null;
		const pendingSpaceWaiters: Array<() => void> = [];
		let forwardChunks = true;

		const enqueue = async (event: ToolOutputChunk): Promise<void> => {
			if (!forwardChunks) return;
			while (pending.length >= MAX_PENDING_CHUNKS) {
				await new Promise<void>((resolve) => {
					pendingSpaceWaiters.push(resolve);
				});
				if (!forwardChunks) return;
			}
			pending.push(event);
			notify?.();
		};

		const pumpStream = async (
			stream: ReadableStream<Uint8Array>,
			file: string,
			capture: BoundedStreamCapture,
		) => {
			const decoder = new TextDecoder();
			const reader = stream.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					const text = decoder.decode(value, { stream: true });
					appendFileSync(file, text, "utf8");
					capture.push(text);
					await enqueue({
						type: "tool_output_chunk",
						callId,
						tool,
						chunk: text,
					});
				}
				const finalText = decoder.decode();
				if (finalText) {
					appendFileSync(file, finalText, "utf8");
					capture.push(finalText);
					await enqueue({
						type: "tool_output_chunk",
						callId,
						tool,
						chunk: finalText,
					});
				}
			} finally {
				reader.releaseLock();
				streamsDoneCount++;
				if (streamsDoneCount === 2) resolveStreamsDone();
				notify?.();
			}
		};

		void pumpStream(proc.stdout, stdoutFile, stdout);
		void pumpStream(proc.stderr, stderrFile, stderr);

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
				const waitForData = new Promise<"data">((resolve) => {
					notify = () => resolve("data");
				});
				const race = await Promise.race([waitForData, waitforPromise]);
				notify = null;
				if (race === "waitfor") break;
			}
			while (pending.length > 0) {
				const chunk = pending.shift();
				pendingSpaceWaiters.shift()?.();
				if (chunk) yield chunk;
			}
		}

		if (backgrounded) {
			forwardChunks = false;
			for (const resolve of pendingSpaceWaiters.splice(0)) resolve();
			return {
				outcome: "backgrounded",
				stdout: stdout.snapshot(),
				stderr: stderr.snapshot(),
				pid: proc.pid,
				durationMs: Date.now() - start,
				streamsDone,
				proc,
				captures: () => ({
					stdout: stdout.snapshot(),
					stderr: stderr.snapshot(),
				}),
			};
		}

		const exitCode = await proc.exited;
		return {
			outcome: "completed",
			stdout: stdout.snapshot(),
			stderr: stderr.snapshot(),
			exitCode,
			durationMs: Date.now() - start,
		};
	} catch (error) {
		return {
			outcome: "error",
			error: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - start,
		};
	}
}
