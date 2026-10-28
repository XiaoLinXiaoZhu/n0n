/**
 * exec scheme — 执行代码（读、推理、变更环境统一走此路）
 *
 * body 是脚本；runtime/claim/cwd/waitfor/max_output_tokens 全部来自 uri。
 * 调度事实：无独占、无共享资源（提交顺序由调度器保证）。
 */

import type { PostToolCall, ToolStreamEvent } from "@n0n/types";
import { execToolStream } from "../exec/executor.ts";
import { decodeSegment, parseExecQuery, WAITFOR_MAX } from "./parse-utils.ts";
import type { SchemeHandler } from "./types.ts";

/** exec:// 的解析产物 — 边界解析一次，向内单向传递 */
export interface ParsedExec {
	scheme: "exec";
	/** uri 中的 runtime 段（URL 解码后） */
	runtime: string;
	/** uri 中的 NAME 段（URL 解码后），模型自述当前步骤 */
	claim: string;
	cwd?: string;
	waitfor?: number;
	maxOutputTokens?: number;
}

const ALL_RUNTIMES =
	"sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv";
const DEFAULT_OUTPUT_TOKENS = 5_000;

export const execScheme: SchemeHandler<ParsedExec> = {
	scheme: "exec",
	uriPrefix: "exec://",
	bodyHint: "Code for exec://",

	describe(ctx) {
		const defaultRuntime = ctx.platform === "win32" ? "cmd" : "sh";
		return [
			`exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_tokens=… . Body is code (a single command or multi-line script with imports, loops, etc.). Runtime options: ${ALL_RUNTIMES} (default: "${defaultRuntime}"). <NAME> is your own short label for what this step is doing (e.g. read-config). cwd is the working directory (default: injected workspace root). waitfor is max seconds to wait (default: ${ctx.default_exec_waitfor}, max: ${WAITFOR_MAX}); exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. max_output_tokens caps the estimated stdout+stderr tokens returned to you (default: ${Math.min(
				DEFAULT_OUTPUT_TOKENS,
				ctx.max_exec_output_tokens,
			)}, max: ${ctx.max_exec_output_tokens}); the budget covers both streams combined and full output is saved as an execution artifact when truncated.`,
		];
	},

	parse(rest, fullUri) {
		// authority 是 runtime；其后首个 / 之后为 claim（可含 /）
		const slash = rest.indexOf("/");
		if (slash <= 0) {
			throw new Error(
				`Malformed exec uri "${fullUri}". Expected exec://<runtime>/<claim>.`,
			);
		}
		const runtime = decodeSegment(rest.slice(0, slash));
		const remainder = rest.slice(slash + 1);
		if (!runtime) {
			throw new Error(
				`Malformed exec uri "${fullUri}". Missing runtime segment.`,
			);
		}

		const q = remainder.indexOf("?");
		const claimPart = q === -1 ? remainder : remainder.slice(0, q);
		const queryPart = q === -1 ? "" : remainder.slice(q + 1);
		const claim = decodeSegment(claimPart);
		if (!claim) {
			throw new Error(
				`Malformed exec uri "${fullUri}". Missing claim (NAME) segment.`,
			);
		}

		return { scheme: "exec", runtime, claim, ...parseExecQuery(queryPart) };
	},

	async *execute(
		parsed,
		call: PostToolCall,
		ctx,
		confirmFn,
	): AsyncGenerator<ToolStreamEvent> {
		yield* execToolStream(call, parsed, confirmFn, {
			workspace: ctx.workspace,
			sessionDir: ctx.sessionDir,
			blocked_commands: ctx.blocked_commands,
			default_exec_waitfor: ctx.default_exec_waitfor,
			max_exec_output_tokens: ctx.max_exec_output_tokens,
			platform: ctx.platform,
			bgSyncIntervalMs: ctx.bgSyncIntervalMs,
		});
	},
};
