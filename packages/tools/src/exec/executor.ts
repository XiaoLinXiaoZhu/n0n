/**
 * exec 命令执行器。
 *
 * 每次执行先创建 execution artifact，stdout/stderr 流式追加到文件。
 * 小输出完成后删除 artifact；大输出和后台执行保留 artifact 并返回引用。
 */

import {
	existsSync,
	mkdirSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { estimateTokens, tailByTokens } from "@n0n/shared";
import type {
	ExecArgs,
	ExecToolResult,
	ExecutionArtifactRef,
	ToolStreamEvent,
} from "@n0n/types";
import {
	buildSpawnCmd,
	RUNTIME_EXT,
	type RunProcessBackgrounded,
	runProcess,
	type StreamCapture,
} from "./process-runner.ts";
import type { ExecRole } from "./role.ts";
import { findBlockedCommand, handleBlockedCommand } from "./security.ts";

export interface ExecCall {
	id: string;
	tool: ExecRole;
	args: ExecArgs;
}

const TRUNCATION_THRESHOLD_TOKENS = 5_000;
const TAIL_TOKENS = 2_000;

interface ArtifactResult {
	version: 1;
	runId: string;
	status: "running" | "completed" | "backgrounded" | "exited";
	pid: number;
	startedAt: string;
	updatedAt: string;
	endedAt: string | null;
	exitCode: number | null;
	durationMs: number;
	stdoutFile: "stdout.txt";
	stderrFile: "stderr.txt";
	stdoutBytes: number;
	stderrBytes: number;
	stdoutLines: number;
	stderrLines: number;
}

interface ArtifactContext {
	ref: ExecutionArtifactRef;
	result: ArtifactResult;
}

function createArtifact(sessionDir: string, pidHint: string): ArtifactContext {
	const runsDir = join(sessionDir, "exec", "runs");
	mkdirSync(runsDir, { recursive: true });
	const runId = `${Date.now()}-${pidHint}-${Math.random().toString(36).slice(2, 8)}`;
	const runDir = join(runsDir, runId);
	mkdirSync(runDir, { recursive: true });
	const stdoutFile = join(runDir, "stdout.txt");
	const stderrFile = join(runDir, "stderr.txt");
	const resultFile = join(runDir, "result.json");
	writeFileSync(stdoutFile, "");
	writeFileSync(stderrFile, "");
	const now = new Date().toISOString();
	const ref: ExecutionArtifactRef = {
		kind: "execution",
		version: 1,
		runId,
		runDir,
		stdoutFile,
		stderrFile,
		resultFile,
	};
	return {
		ref,
		result: {
			version: 1,
			runId,
			status: "running",
			pid: 0,
			startedAt: now,
			updatedAt: now,
			endedAt: null,
			exitCode: null,
			durationMs: 0,
			stdoutFile: "stdout.txt",
			stderrFile: "stderr.txt",
			stdoutBytes: 0,
			stderrBytes: 0,
			stdoutLines: 0,
			stderrLines: 0,
		},
	};
}

function writeArtifactResult(context: ArtifactContext): void {
	context.result.updatedAt = new Date().toISOString();
	const temp = `${context.ref.resultFile}.tmp`;
	writeFileSync(temp, `${JSON.stringify(context.result, null, 2)}\n`, "utf8");
	renameSync(temp, context.ref.resultFile);
}

function updateCaptureStats(
	context: ArtifactContext,
	stdout: StreamCapture,
	stderr: StreamCapture,
): void {
	context.result.stdoutBytes = stdout.byteLength;
	context.result.stderrBytes = stderr.byteLength;
	context.result.stdoutLines = stdout.charLength === 0 ? 0 : stdout.lines;
	context.result.stderrLines = stderr.charLength === 0 ? 0 : stderr.lines;
}

function removeArtifact(context: ArtifactContext): void {
	rmSync(context.ref.runDir, { recursive: true, force: true });
}

function startBackgroundTracking(
	processResult: RunProcessBackgrounded,
	context: ArtifactContext,
	startTime: number,
	tmpFile: string,
	intervalMs?: number,
): void {
	context.result.status = "backgrounded";
	context.result.pid = processResult.pid;
	context.result.durationMs = processResult.durationMs;
	updateCaptureStats(context, processResult.stdout, processResult.stderr);
	writeArtifactResult(context);

	void (async () => {
		const timer = setInterval(() => {
			const captures = processResult.captures();
			updateCaptureStats(context, captures.stdout, captures.stderr);
			writeArtifactResult(context);
		}, intervalMs ?? 3_000);
		try {
			await processResult.streamsDone;
			const exitCode = await processResult.proc.exited;
			context.result.status = "exited";
			context.result.exitCode = exitCode;
			context.result.endedAt = new Date().toISOString();
			context.result.durationMs = Date.now() - startTime;
			const captures = processResult.captures();
			updateCaptureStats(context, captures.stdout, captures.stderr);
			writeArtifactResult(context);
		} catch {
			// 后台状态写入失败不影响主流程。
		} finally {
			clearInterval(timer);
			try {
				unlinkSync(tmpFile);
			} catch {}
		}
	})();
}

export async function* execToolStream(
	call: ExecCall,
	confirmFn: ((question: string) => Promise<string>) | undefined,
	toolsConfig: {
		workspace: string;
		tempDir: string;
		sessionDir: string;
		blocked_commands: string[];
		default_exec_waitfor: number;
		platform: "win32" | "darwin" | "linux";
		bgSyncIntervalMs?: number;
	},
): AsyncGenerator<ToolStreamEvent> {
	const defaultRuntime = toolsConfig.platform === "win32" ? "cmd" : "sh";
	const runtime = call.args.runtime ?? defaultRuntime;
	const workspace = toolsConfig.workspace;
	const cwd = call.args.cwd
		? isAbsolute(call.args.cwd)
			? call.args.cwd
			: resolve(workspace, call.args.cwd)
		: workspace;
	const waitforS = Math.min(
		call.args.waitfor ?? toolsConfig.default_exec_waitfor,
		240,
	);
	const start = Date.now();

	const blockedCmd = findBlockedCommand(
		call.args.script,
		toolsConfig.blocked_commands,
		toolsConfig.platform,
	);
	if (blockedCmd !== null) {
		const blocked = await handleBlockedCommand(
			call,
			cwd,
			blockedCmd,
			toolsConfig.platform,
			confirmFn,
		);
		if (blocked) {
			yield blocked;
			return;
		}
	}

	const tempDir = resolve(toolsConfig.tempDir);
	mkdirSync(tempDir, { recursive: true });
	const scriptDir = resolve(cwd);
	if (!existsSync(scriptDir)) mkdirSync(scriptDir, { recursive: true });
	const ext = RUNTIME_EXT[runtime] ?? "";
	const tmpFile = join(
		scriptDir,
		`_n0n_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
	);
	const artifact = createArtifact(toolsConfig.sessionDir, call.id);
	writeArtifactResult(artifact);
	let cleanupTempFile = true;
	let keepArtifact = false;

	try {
		await Bun.write(
			tmpFile,
			runtime === "cmd" ? `@${call.args.script}\n` : call.args.script,
		);
		const result = yield* runProcess({
			spawnCmd: buildSpawnCmd(runtime, tmpFile),
			cwd,
			waitforMs: waitforS * 1_000,
			callId: call.id,
			tool: call.tool,
			stdoutFile: artifact.ref.stdoutFile,
			stderrFile: artifact.ref.stderrFile,
		});

		switch (result.outcome) {
			case "backgrounded": {
				keepArtifact = true;
				cleanupTempFile = false;
				startBackgroundTracking(
					result,
					artifact,
					start,
					tmpFile,
					toolsConfig.bgSyncIntervalMs,
				);
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "backgrounded",
					pid: result.pid,
					artifact: artifact.ref,
					stdoutSoFar: tailByTokens(result.stdout.tail, TAIL_TOKENS),
					stderrSoFar: tailByTokens(result.stderr.tail, TAIL_TOKENS),
					durationMs: result.durationMs,
				} satisfies ExecToolResult;
				return;
			}
			case "error": {
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "completed",
					exitCode: 1,
					stdout: "",
					stderr: result.error,
					durationMs: result.durationMs,
				} satisfies ExecToolResult;
				return;
			}
			case "completed": {
				const { stdout, stderr, exitCode, durationMs } = result;
				const isTruncated =
					!stdout.complete ||
					!stderr.complete ||
					estimateTokens(stdout.content + stderr.content) >
						TRUNCATION_THRESHOLD_TOKENS;
				if (!isTruncated) {
					yield {
						type: "tool_result",
						tool: call.tool,
						call,
						status: "completed",
						exitCode,
						stdout:
							stdout.content ||
							(stderr.content || exitCode !== 0
								? ""
								: "(no output — script may not have top-level executable code, or async operations may not have been awaited.)"),
						stderr: stderr.content,
						durationMs,
					} satisfies ExecToolResult;
					return;
				}

				keepArtifact = true;
				artifact.result.status = "completed";
				artifact.result.exitCode = exitCode;
				artifact.result.endedAt = new Date().toISOString();
				artifact.result.durationMs = durationMs;
				updateCaptureStats(artifact, stdout, stderr);
				writeArtifactResult(artifact);

				const stdoutTail = tailByTokens(stdout.tail, TAIL_TOKENS);
				const stderrTail = tailByTokens(stderr.tail, TAIL_TOKENS);
				const totalLines =
					(stdout.charLength === 0 ? 0 : stdout.lines) +
					(stderr.charLength === 0 ? 0 : stderr.lines);
				const tailLines =
					stdoutTail.length === 0 ? 0 : stdoutTail.split("\n").length;
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "truncated",
					exitCode,
					stdoutTail,
					stderrTail,
					artifact: artifact.ref,
					stdoutLength: stdout.charLength,
					stderrLength: stderr.charLength,
					totalLines,
					tailStartLine: Math.max(1, stdout.lines - tailLines + 1),
					durationMs,
				} satisfies ExecToolResult;
				return;
			}
		}
	} catch (error) {
		yield {
			type: "tool_result",
			tool: call.tool,
			call,
			status: "completed",
			exitCode: 1,
			stdout: "",
			stderr: error instanceof Error ? error.message : String(error),
			durationMs: Date.now() - start,
		} satisfies ExecToolResult;
	} finally {
		if (cleanupTempFile) {
			try {
				unlinkSync(tmpFile);
			} catch {}
		}
		if (!keepArtifact) removeArtifact(artifact);
	}
}
