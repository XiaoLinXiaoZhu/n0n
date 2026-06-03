/**
 * exec 命令执行器
 *
 * 将模型提供的 script 写入临时文件，通过 ProcessRunner 执行，
 * 根据结果（completed / backgrounded / error）格式化输出。
 *
 * 等待架构（为什么用 Promise.race 而不是 setTimeout + kill）：
 * 旧方案 setTimeout → proc.kill() 依赖一个脆弱假设：kill 信号能让 stdout/stderr
 * 流关闭从而唤醒读取循环。实际上常不成立：
 * - shell 脚本 fork 的子进程不受 kill 影响，继续持有管道
 * - 某些进程捕获/忽略 SIGTERM
 * - 子进程继承管道 fd，即使父进程退出流也不关闭
 * 结果：流读取的 await 永远不 resolve，agent 主循环卡死。
 *
 * 当前方案（见 process-runner.ts）：Promise.race 让等待 Promise 与流读取竞争，
 * 确定性中断。等待超限后进程转入后台继续执行。
 */

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import {
	estimateTokens,
	splitLinesByTokenBudget,
	tailByTokens,
} from "@n0n/shared";
import type { ExecArgs, ExecToolResult, ToolStreamEvent } from "@n0n/types";
import {
	buildSpawnCmd,
	RUNTIME_EXT,
	type RunProcessBackgrounded,
	runProcess,
} from "./process-runner.ts";
import { findBlockedCommand, handleBlockedCommand } from "./security.ts";

/**
 * 内部执行调用类型 — carry 实际工具名（observe / reason / act）。
 * 不依赖 @n0n/types 中的 ToolCallRecord 类型，避免循环依赖。
 */
export interface ExecCall {
	id: string;
	tool: "observe" | "reason" | "act";
	args: ExecArgs;
}

/** 生成简短的截断输出文件名，自动避让已有文件 */
function makeShortOutputPath(tempDir: string): string {
	const rand = Math.random().toString(36).slice(2, 8);
	const name = `exec_output_${rand}.txt`;
	const full = join(tempDir, name);
	if (existsSync(full)) return makeShortOutputPath(tempDir);
	return full;
}

/** 超过此阈值（stdout+stderr 合计预估 token 数）触发截断写文件 */
const TRUNCATION_THRESHOLD_TOKENS = 5_000;
/** 截断后展示的末尾 token 数 */
const TAIL_TOKENS = 2_000;

// ── 后台协程管理 ──

/**
 * 启动后台协程：定期同步输出到日志文件 + 等待进程结束写最终结果。
 * 独立于主执行流，fire-and-forget。
 */
async function startBackgroundSync(
	result: RunProcessBackgrounded,
	startTime: number,
	tempDir: string,
	tmpFile: string,
): Promise<string> {
	const { pid, stdoutChunks, stderrChunks, streamsDone, proc } = result;
	const logFile = join(tempDir, `exec_bg_${pid}.log`);
	const startedAt = new Date(startTime).toISOString();

	const buildLogContent = (opts: {
		status: "running" | "exited";
		stdout: string;
		stderr: string;
		exitCode?: number;
		endedAt?: string;
		totalDurationMs?: number;
	}): string => {
		const now = new Date().toISOString();
		const stdoutSection = `--- stdout ---\n${opts.stdout || "(empty)"}`;
		const stderrSection = `--- stderr ---\n${opts.stderr || "(empty)"}`;

		const metaLines = [
			`pid: ${pid}`,
			`status: ${opts.status}`,
			`started_at: ${startedAt}`,
		];

		if (opts.status === "running") {
			metaLines.push(`last_updated: ${now}`);
			metaLines.push(
				`note: If current time is far ahead of last_updated, log sync may be delayed — verify process status via PID. If current time is close to last_updated and content unchanged, the process likely has no new output.`,
			);
		} else {
			if (opts.exitCode !== undefined)
				metaLines.push(`exit_code: ${opts.exitCode}`);
			if (opts.endedAt) metaLines.push(`ended_at: ${opts.endedAt}`);
			if (opts.totalDurationMs !== undefined) {
				const secs = Math.round(opts.totalDurationMs / 1000);
				const mins = Math.floor(secs / 60);
				const remSecs = secs % 60;
				const human = mins > 0 ? `${mins}m ${remSecs}s` : `${secs}s`;
				metaLines.push(`duration: ${opts.totalDurationMs}ms (${human})`);
			}
			metaLines.push(`last_updated: ${now}`);
		}

		return `${stdoutSection}\n${stderrSection}\n--- exec_bg_meta ---\n${metaLines.join("\n")}\n---\n`;
	};

	// 初始同步：在后台协程启动前立即写入当前输出
	const initialStdout = stdoutChunks.join("");
	const initialStderr = stderrChunks.join("");
	await Bun.write(
		logFile,
		buildLogContent({
			status: "running",
			stdout: initialStdout,
			stderr: initialStderr,
		}),
	);

	// 后台协程：定期同步 + 等待结束写最终结果
	(async () => {
		const SYNC_INTERVAL_MS = 3000;
		let syncTimer: ReturnType<typeof setInterval> | null = null;

		const syncToFile = () => {
			const currentStdout = stdoutChunks.join("");
			const currentStderr = stderrChunks.join("");
			// 非阻塞写入（fire-and-forget 在 interval 中）
			Bun.write(
				logFile,
				buildLogContent({
					status: "running",
					stdout: currentStdout,
					stderr: currentStderr,
				}),
			);
		};

		try {
			// 定期同步：即使没有新输出也更新 last_updated 时间戳
			syncTimer = setInterval(syncToFile, SYNC_INTERVAL_MS);

			await streamsDone;

			// DESIGN NOTE: why no timeout on proc.exited?
			// 1. For daemon processes, streamsDone already resolved — data
			//    is fully collected; setInterval merely refreshes the
			//    timestamp in the log file, no data is leaked.
			// 2. A hard timeout would kill intentionally backgrounded
			//    processes (e.g. a dev server started by observe) that
			//    the caller expects to keep running.
			// 3. The model/agent should use ps / taskkill to judge the
			//    process state and decide whether to wait, terminate, or
			//    ignore it.
			const exitCode = await proc.exited;
			const endedAt = new Date().toISOString();
			const totalDurationMs = Date.now() - startTime;
			const finalStdout = stdoutChunks.join("");
			const finalStderr = stderrChunks.join("");

			await Bun.write(
				logFile,
				buildLogContent({
					status: "exited",
					stdout: finalStdout,
					stderr: finalStderr,
					exitCode,
					endedAt,
					totalDurationMs,
				}),
			);
		} catch {
			// 后台协程出错不影响主流程
		} finally {
			if (syncTimer) clearInterval(syncTimer);
			try {
				unlinkSync(tmpFile);
			} catch {
				// ignore cleanup errors
			}
		}
	})();

	return logFile;
}

// ── 主入口 ──

/**
 * 流式执行脚本。
 *
 * 流程：安全检测 → 写临时文件 → runProcess → 格式化输出。
 * 等待超限后进程转入后台继续执行，已捕获输出 + 后续输出写入 .temp/ 日志文件。
 */
export async function* execToolStream(
	call: ExecCall,
	confirmFn: ((question: string) => Promise<string>) | undefined,
	toolsConfig: {
		workspace: string;
		tempDir: string;
		blocked_commands: string[];
		default_exec_waitfor: number;
		platform: "win32" | "darwin" | "linux";
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
	// prompt cache 的 TTL 为 5 分钟，等待过长会导致缓存失效
	const MAX_WAITFOR_S = 240;
	const waitforS = Math.min(
		call.args.waitfor ?? toolsConfig.default_exec_waitfor,
		MAX_WAITFOR_S,
	);
	const waitforMs = waitforS * 1000;
	const start = Date.now();

	// ── 安全检测 ──
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

	// ── 写临时文件 ──
	const ext = RUNTIME_EXT[runtime] ?? "";
	const tempDir = resolve(toolsConfig.tempDir);
	if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });
	const scriptDir = resolve(cwd);
	if (!existsSync(scriptDir)) mkdirSync(scriptDir, { recursive: true });
	const tmpFile = join(
		scriptDir,
		`_n0n_exec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`,
	);

	let cleanupTempFile = true;

	try {
		const scriptContent =
			runtime === "cmd" ? `@${call.args.script}\n` : call.args.script;
		await Bun.write(tmpFile, scriptContent);

		const spawnCmd = buildSpawnCmd(runtime, tmpFile);

		// ── 执行 ──
		const result = yield* runProcess({
			spawnCmd,
			cwd,
			waitforMs,
			callId: call.id,
			tool: call.tool,
		});

		switch (result.outcome) {
			case "backgrounded": {
				// 启动后台协程：定期同步 + 等待结束
				// await 初始同步写入，确保日志文件在 tool result 返回前已存在
				const logFile = await startBackgroundSync(
					result,
					start,
					tempDir,
					tmpFile,
				);

				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "backgrounded",
					pid: result.pid,
					logFile,
					stdoutSoFar: tailByTokens(result.stdoutSoFar, TAIL_TOKENS),
					stderrSoFar: tailByTokens(result.stderrSoFar, TAIL_TOKENS),
					durationMs: result.durationMs,
				} satisfies ExecToolResult;
				cleanupTempFile = false;
				return;
			}

			case "error": {
				yield {
					type: "tool_result",
					tool: call.tool,
					call,
					status: "completed" as const,
					exitCode: 1,
					stdout: "",
					stderr: result.error,
					durationMs: result.durationMs,
				} satisfies ExecToolResult;
				return;
			}

			case "completed": {
				const { stdout, stderr, exitCode, durationMs } = result;
				const totalTokens = estimateTokens(stdout + stderr);

				if (totalTokens > TRUNCATION_THRESHOLD_TOKENS) {
					// 截断路径：完整输出写入文件
					const outputFile = makeShortOutputPath(tempDir);
					const fileContent = [
						stdout,
						"--- stderr ---",
						stderr,
						`--- exit code: ${exitCode} ---`,
					].join("\n");
					await Bun.write(outputFile, fileContent);

					const stdoutTail = tailByTokens(stdout, TAIL_TOKENS);
					const truncatedText = stdout.substring(
						0,
						stdout.length - stdoutTail.length,
					);
					const truncatedChunks =
						truncatedText.length > 0
							? splitLinesByTokenBudget(truncatedText, TAIL_TOKENS)
							: [];
					const totalLines =
						stdout.split("\n").length + stderr.split("\n").length;
					const tailLines = stdoutTail.split("\n").length;
					const tailStartLine = totalLines - tailLines + 1;

					yield {
						type: "tool_result",
						tool: call.tool,
						call,
						status: "truncated",
						exitCode,
						stdoutTail,
						stderrTail: tailByTokens(stderr, TAIL_TOKENS),
						outputFile,
						stdoutLength: stdout.length,
						stderrLength: stderr.length,
						totalLines,
						tailStartLine,
						truncatedChunks,
						durationMs,
					} satisfies ExecToolResult;
				} else {
					// 正常路径：输出直接返回
					const hasOutput = stdout.trim() || stderr.trim();
					const hint =
						!hasOutput && exitCode === 0
							? "(no output — script may not have top-level executable code, or async operations may not have been awaited.)"
							: "";

					yield {
						type: "tool_result",
						tool: call.tool,
						call,
						status: "completed",
						exitCode,
						stdout: hint || stdout,
						stderr,
						durationMs,
					} satisfies ExecToolResult;
				}
				return;
			}

			default: {
				const _exhaustive: never = result;
				throw new Error(
					`Unexpected process outcome: ${(result as { outcome: string }).outcome}`,
				);
			}
		}
	} catch (err) {
		yield {
			type: "tool_result",
			tool: call.tool,
			call,
			status: "completed" as const,
			exitCode: 1,
			stdout: "",
			stderr: err instanceof Error ? err.message : String(err),
			durationMs: Date.now() - start,
		} satisfies ExecToolResult;
	} finally {
		// true：正常完成或出错路径，在此清理
		// false：后台协程负责清理，此处跳过
		if (cleanupTempFile) {
			try {
				unlinkSync(tmpFile);
			} catch {
				// ignore cleanup errors
			}
		}
	}
}
