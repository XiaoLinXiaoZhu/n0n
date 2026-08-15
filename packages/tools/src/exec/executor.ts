/**
 * exec 命令执行器。
 *
 * 每次执行先创建 execution artifact，stdout/stderr 流式追加到文件。
 * 小输出完成后删除 artifact；大输出和后台执行保留 artifact 并返回引用。
 */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { headTailByTokens } from "@n0n/shared";
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

const DEFAULT_OUTPUT_TOKENS = 5_000;

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
	stdoutEstimatedTokens: number;
	stderrEstimatedTokens: number;
}

interface ArtifactContext {
	ref: ExecutionArtifactRef;
	result: ArtifactResult;
}

/**
 * 分配下一个 run 序号并原子创建其目录。
 *
 * 不引入独立计数器状态——runs 目录自身即状态。起点取"现有数字目录最大序号
 * +1"（索引单调递增、不回填已删除 run 留下的空洞），再用 mkdir 的原子性
 * 完成并发占用：mkdir 成功即占用该序号，遇 EEXIST 则递增重试。
 */
function allocateRunDir(runsDir: string): { runId: string; runDir: string } {
	mkdirSync(runsDir, { recursive: true });
	let next = 1;
	for (const name of readdirSync(runsDir)) {
		if (!/^\d+$/.test(name)) continue;
		const n = Number.parseInt(name, 10);
		if (n >= next) next = n + 1;
	}
	for (;;) {
		const runId = String(next).padStart(4, "0");
		const runDir = join(runsDir, runId);
		try {
			mkdirSync(runDir);
			return { runId, runDir };
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
			next++;
		}
	}
}

function createArtifact(sessionDir: string): ArtifactContext {
	const runsDir = join(sessionDir, "exec", "runs");
	const { runId, runDir } = allocateRunDir(runsDir);
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
			stdoutEstimatedTokens: 0,
			stderrEstimatedTokens: 0,
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
	context.result.stdoutEstimatedTokens = stdout.estimatedTokens;
	context.result.stderrEstimatedTokens = stderr.estimatedTokens;
}

function allocateBudgets(
	totalBudget: number,
	stdoutTokens: number,
	stderrTokens: number,
): { stdout: number; stderr: number } {
	if (stderrTokens === 0) return { stdout: totalBudget, stderr: 0 };
	if (stdoutTokens === 0) return { stdout: 0, stderr: totalBudget };
	const totalTokens = stdoutTokens + stderrTokens;
	const stdout = Math.max(
		1,
		Math.min(
			totalBudget - 1,
			Math.round(totalBudget * (stdoutTokens / totalTokens)),
		),
	);
	return { stdout, stderr: totalBudget - stdout };
}

function capturePreview(capture: StreamCapture, budget: number): string {
	if (budget <= 0 || capture.charLength === 0) return "";
	if (capture.complete) return headTailByTokens(capture.content, budget);
	const overlap = Math.max(
		0,
		capture.head.length + capture.tail.length - capture.charLength,
	);
	const nonOverlappingTail = capture.tail.slice(overlap);
	return headTailByTokens(`${capture.head}${nonOverlappingTail}`, budget);
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
		max_exec_output_tokens: number;
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
	const outputTokenBudget =
		call.args.output_tokens ??
		Math.min(DEFAULT_OUTPUT_TOKENS, toolsConfig.max_exec_output_tokens);
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
	const artifact = createArtifact(toolsConfig.sessionDir);
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
			maxCaptureTokens: toolsConfig.max_exec_output_tokens,
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
				const budgets = allocateBudgets(
					outputTokenBudget,
					result.stdout.estimatedTokens,
					result.stderr.estimatedTokens,
				);
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "backgrounded",
					pid: result.pid,
					artifact: artifact.ref,
					stdoutSoFar: capturePreview(result.stdout, budgets.stdout),
					stderrSoFar: capturePreview(result.stderr, budgets.stderr),
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
				const totalEstimatedTokens =
					stdout.estimatedTokens + stderr.estimatedTokens;
				const isTruncated =
					!stdout.complete ||
					!stderr.complete ||
					totalEstimatedTokens > outputTokenBudget;
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

				const budgets = allocateBudgets(
					outputTokenBudget,
					stdout.estimatedTokens,
					stderr.estimatedTokens,
				);
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "truncated",
					exitCode,
					stdoutPreview: capturePreview(stdout, budgets.stdout),
					stderrPreview: capturePreview(stderr, budgets.stderr),
					artifact: artifact.ref,
					stdoutLength: stdout.charLength,
					stderrLength: stderr.charLength,
					stdoutLines: stdout.charLength === 0 ? 0 : stdout.lines,
					stderrLines: stderr.charLength === 0 ? 0 : stderr.lines,
					outputTokenBudget,
					stdoutEstimatedTokens: stdout.estimatedTokens,
					stderrEstimatedTokens: stderr.estimatedTokens,
					totalEstimatedTokens,
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
