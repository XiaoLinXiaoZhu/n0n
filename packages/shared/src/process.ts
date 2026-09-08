/**
 * process — 受控的子进程执行辅助
 *
 * 统一使用 Bun.spawn，并固定 stdin 为 "ignore"：
 * - 子进程立即读到 EOF，不会等待父进程写入；
 * - 避免 Windows 上 stdin 接到管道时，某些可执行文件
 *   （如 Microsoft Store 的 App Execution Alias）阻塞数秒；
 * - 避免子进程消费父进程的终端输入。
 */

export interface RunCommandOptions {
	/** 子进程工作目录；默认继承当前进程 */
	cwd?: string;
	/** 超时毫秒数；超时后杀掉子进程并抛出 RunCommandError */
	timeoutMs?: number;
	/** 中止信号；触发后杀掉子进程并抛出 RunCommandError */
	signal?: AbortSignal;
	/** stdout/stderr 的最大字节数；超过后 Bun 会杀掉子进程 */
	maxBuffer?: number;
}

export interface RunCommandResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

export interface RunCommandErrorDetails {
	exitCode: number | null;
	timedOut: boolean;
	aborted: boolean;
	stdout: string;
	stderr: string;
}

export class RunCommandError extends Error {
	readonly exitCode: number | null;
	readonly timedOut: boolean;
	readonly aborted: boolean;
	readonly stdout: string;
	readonly stderr: string;

	constructor(message: string, details: RunCommandErrorDetails) {
		super(message);
		this.name = "RunCommandError";
		this.exitCode = details.exitCode;
		this.timedOut = details.timedOut;
		this.aborted = details.aborted;
		this.stdout = details.stdout;
		this.stderr = details.stderr;
	}
}

async function readStream(
	stream: ReadableStream<Uint8Array> | undefined,
): Promise<string> {
	if (stream === undefined) return "";
	try {
		return await new Response(stream).text();
	} catch {
		return "";
	}
}

export async function runCommand(
	cmd: readonly string[],
	options: RunCommandOptions = {},
): Promise<RunCommandResult> {
	let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
	try {
		proc = Bun.spawn({
			cmd: [...cmd],
			env: process.env,
			stdin: "ignore",
			stdout: "pipe",
			stderr: "pipe",
			...(options.cwd === undefined ? {} : { cwd: options.cwd }),
			...(options.maxBuffer === undefined
				? {}
				: { maxBuffer: options.maxBuffer }),
			...(options.signal === undefined ? {} : { signal: options.signal }),
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new RunCommandError(`failed to spawn ${cmd.join(" ")}: ${message}`, {
			exitCode: null,
			timedOut: false,
			aborted: options.signal?.aborted ?? false,
			stdout: "",
			stderr: "",
		});
	}

	let timedOut = false;
	let aborted = options.signal?.aborted ?? false;
	const onAbort = () => {
		aborted = true;
	};
	if (!aborted) {
		options.signal?.addEventListener("abort", onAbort, { once: true });
	}

	const timer =
		options.timeoutMs === undefined
			? null
			: setTimeout(() => {
					timedOut = true;
					proc.kill();
				}, options.timeoutMs);

	try {
		const [stdout, stderr] = await Promise.all([
			readStream(proc.stdout),
			readStream(proc.stderr),
		]);
		const exitCode = await proc.exited;

		if (timedOut) {
			throw new RunCommandError(
				`command timed out after ${options.timeoutMs} ms: ${cmd.join(" ")}`,
				{ exitCode, timedOut: true, aborted, stdout, stderr },
			);
		}
		if (aborted) {
			throw new RunCommandError(`command aborted: ${cmd.join(" ")}`, {
				exitCode,
				timedOut: false,
				aborted: true,
				stdout,
				stderr,
			});
		}
		if (exitCode !== 0) {
			throw new RunCommandError(
				`command exited with code ${exitCode}: ${cmd.join(" ")}`,
				{ exitCode, timedOut: false, aborted: false, stdout, stderr },
			);
		}
		return { stdout, stderr, exitCode };
	} finally {
		if (timer !== null) clearTimeout(timer);
		options.signal?.removeEventListener("abort", onAbort);
	}
}

export type RunCommandFn = typeof runCommand;
