/**
 * observe/reason/act tool result 格式化 — 含 anti-few-shot 变体
 *
 * 多部分拼装（meta、stdout/stderr tag、hint 等）各自使用
 * msgIndex+N 偏移独立选择变体，组合爆炸产生远超单维度的多样性。
 *
 * 返回 FormattedToolResult：fact（客观数据）与 hint（系统操作建议）分离。
 * fact = 模型未来可能用到且不会过时的信息（状态、PID、artifact 路径等）
 * hint = 仅当前轮有用的操作建议，隔一轮就不需要了
 */

import type { ExecToolResult, ExecutionArtifactRef } from "@n0n/types";
import type { FormattedToolResult, TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const IS_WINDOWS = process.platform === "win32";

// ── 变体模板 ──

const metaTemplates = [
	(rt: string, cwd: string, exit: number, ms: number) =>
		`[${rt}] [cwd: ${cwd}] [exit: ${exit}] [${ms}ms]`,
	(rt: string, cwd: string, exit: number, ms: number) =>
		`runtime=${rt} cwd=${cwd} exitCode=${exit} duration=${ms}ms`,
	(rt: string, cwd: string, exit: number, ms: number) =>
		`(${rt}) ${cwd} | exit ${exit} | ${ms}ms`,
];

const backgroundedMetaTemplates = [
	(rt: string, cwd: string, ms: number) =>
		`[${rt}] [cwd: ${cwd}] [backgrounded after ${ms}ms]`,
	(rt: string, cwd: string, ms: number) =>
		`runtime=${rt} cwd=${cwd} status=backgrounded after ${ms}ms`,
	(rt: string, cwd: string, ms: number) =>
		`(${rt}) ${cwd} | backgrounded | ${ms}ms`,
];

const truncatedMetaTemplates = [
	(rt: string, cwd: string, exit: number, ms: number, file: string) =>
		`[${rt}] [cwd: ${cwd}] [exit: ${exit}] [${ms}ms] [output truncated → ${file}]`,
	(rt: string, cwd: string, exit: number, ms: number, file: string) =>
		`runtime=${rt} cwd=${cwd} exitCode=${exit} duration=${ms}ms truncated→${file}`,
	(rt: string, cwd: string, exit: number, ms: number, file: string) =>
		`(${rt}) ${cwd} | exit ${exit} | ${ms}ms | truncated to ${file}`,
];

/** backgrounded fact 模板：包含 PID 和 artifact 路径（持久有效的客观信息） */
const backgroundedFactTemplates = [
	(pid: number, artifact: string) =>
		`Process exceeded waitfor limit, moved to background.\nPID: ${pid}\nExecution artifact: ${artifact}`,
	(pid: number, artifact: string) =>
		`Waitfor exceeded — process continues in background (PID ${pid}).\nExecution artifact: ${artifact}`,
	(pid: number, artifact: string) =>
		`Background process started (PID: ${pid}).\nThe command exceeded its waitfor limit but is still running.\nExecution artifact: ${artifact}`,
];

/** backgrounded hint 模板：操作建议（隔轮后不需要） */
const backgroundedHintTemplates = [
	"The execution artifact updates while the process runs — inspect result.json, then use rg/jq or bounded standard commands on stdout/stderr.\nBefore continuing other tasks, decide whether this process still needs to run in the background. If not, kill it by PID — do not leave it running unattended.",
	"The artifact files update as output arrives — check result.json and read stdout/stderr for progress.\nBefore moving on, judge whether you still need this process running. If not, terminate it by PID rather than leaving it idle.",
	"Execution artifacts update while the process runs; inspect them for progress.\nDecide now: does this process need to keep running? If not, kill it by PID. Do not leave background processes running without purpose.",
];

function artifactDisplay(artifact: ExecutionArtifactRef): string {
	return artifact.runDir;
}

function artifactStreams(artifact: ExecutionArtifactRef): {
	stdout: string;
	stderr: string;
} {
	return { stdout: artifact.stdoutFile, stderr: artifact.stderrFile };
}

/** truncated fact 模板：输出产物路径（持久有效） */
const truncatedFactTemplates = [
	(tokens: number, budget: number, lines: number, streams: string) =>
		`Estimated output ${tokens} tokens / requested ${budget}; ${lines} lines. Full output saved as execution artifacts:\n${streams}`,
	(tokens: number, budget: number, lines: number, streams: string) =>
		`Output exceeded its ${budget}-token return budget (~${tokens} tokens, ${lines} lines). Complete streams:\n${streams}`,
	(tokens: number, budget: number, lines: number, streams: string) =>
		`Complete output saved (${lines} lines, ~${tokens} tokens; return budget ${budget}):\n${streams}`,
];

/** truncated hint 模板：操作建议（隔轮后不需要） */
const truncatedHintTemplates = [
	`Choose by semantics: filter the artifact with ${IS_WINDOWS ? "Select-String/jq" : "rg/jq"} or a script; read known bounded ranges; or, only for a cheap read-only command, rerun with a larger output_tokens value. Never rerun a state-changing act merely to obtain more output.`,
	"Use the saved artifact for expensive or non-idempotent commands. For a cheap read-only command, a larger output_tokens value is also valid; otherwise filter or preprocess the artifact.",
	"Do not blindly dump the artifact. Filter it, read explicit bounded ranges (independent ranges may be batched), or safely rerun a cheap read-only command with a sufficient output_tokens budget.",
];

const diagnosticHintTemplates = [
	"Package/module not found. Possible causes: (1) the package is not listed in the project root dependencies — check package.json; (2) dependencies not installed — run the appropriate install command; (3) for Python with uv, declare inline dependencies using PEP 723 `# /// script` metadata.",
	"Module resolution failed. Check: (1) Is the package in package.json? (2) Have dependencies been installed? (3) For uv/Python, use PEP 723 inline `# /// script` dependency declarations.",
	"Cannot resolve package/module. Verify: (1) package.json lists it as a dependency; (2) install has been run; (3) Python scripts using uv should declare deps with PEP 723 `# /// script` metadata.",
];

const stdoutTagNames = ["stdout", "output", "console_output"];
const stderrTagNames = ["stderr", "error_output", "console_error"];

// ── 格式化函数 ──

export function formatExecResult(
	msg: ExecToolResult,
	tags: TagAdapter,
	msgIndex: number,
): FormattedToolResult {
	const runtime = msg.call.args.runtime ?? "unknown";
	const cwd = msg.call.args.cwd ?? ".";
	const toolLabel = msg.tool;
	// 每个 pick 点用不同偏移：meta=+0, stdoutTag=+1, stderrTag=+2, notice/hint=+3, diagnostic=+4
	const stdoutTag = pick(stdoutTagNames, msgIndex + 1);
	const stderrTag = pick(stderrTagNames, msgIndex + 2);

	switch (msg.status) {
		case "backgrounded": {
			const metaFn = pick(backgroundedMetaTemplates, msgIndex);
			const factParts = [
				tags.wrapTag(`${toolLabel}_meta`, metaFn(runtime, cwd, msg.durationMs)),
			];

			// PID + artifact 路径：持久有效的客观信息，属于 fact
			const noticeFn = pick(backgroundedFactTemplates, msgIndex + 3);
			factParts.push(
				tags.wrapTag(
					"waitfor_notice",
					noticeFn(msg.pid, artifactDisplay(msg.artifact)),
				),
			);

			if (msg.stdoutSoFar)
				factParts.push(tags.wrapTag(stdoutTag, msg.stdoutSoFar));
			if (msg.stderrSoFar)
				factParts.push(tags.wrapTag(stderrTag, msg.stderrSoFar));

			// reason 的输出标注为内部思考
			if (toolLabel === "reason") {
				factParts.push(tags.wrapTag("reason_internal", "[reason — internal]"));
			}

			// 操作建议：隔轮后不需要
			const hint = pick(backgroundedHintTemplates, msgIndex + 4);

			return { fact: factParts.join("\n"), hint };
		}
		case "truncated": {
			const metaFn = pick(truncatedMetaTemplates, msgIndex);
			const factParts = [
				tags.wrapTag(
					`${toolLabel}_meta`,
					metaFn(
						runtime,
						cwd,
						msg.exitCode,
						msg.durationMs,
						artifactDisplay(msg.artifact),
					),
				),
			];

			if (msg.stdoutPreview)
				factParts.push(tags.wrapTag(stdoutTag, msg.stdoutPreview));
			if (msg.stderrPreview)
				factParts.push(tags.wrapTag(stderrTag, msg.stderrPreview));

			// reason 的输出标注为内部思考
			if (toolLabel === "reason") {
				factParts.push(tags.wrapTag("reason_internal", "[reason — internal]"));
			}

			const streams = artifactStreams(msg.artifact);
			const streamText = [
				`stdout: ${streams.stdout}`,
				`stderr: ${streams.stderr}`,
			].join("\n");
			const truncFactFn = pick(truncatedFactTemplates, msgIndex + 3);
			factParts.push(
				tags.wrapTag(
					"output_info",
					truncFactFn(
						msg.totalEstimatedTokens,
						msg.outputTokenBudget,
						msg.stdoutLines + msg.stderrLines,
						streamText,
					),
				),
			);

			// 操作建议：隔轮后不需要
			const hint = pick(truncatedHintTemplates, msgIndex + 4);

			return { fact: factParts.join("\n"), hint };
		}
		case "completed": {
			const metaFn = pick(metaTemplates, msgIndex);
			const factParts = [
				tags.wrapTag(
					`${toolLabel}_meta`,
					metaFn(runtime, cwd, msg.exitCode, msg.durationMs),
				),
			];

			if (msg.stdout) factParts.push(tags.wrapTag(stdoutTag, msg.stdout));
			if (msg.stderr) factParts.push(tags.wrapTag(stderrTag, msg.stderr));

			// reason 的输出标注为内部思考
			if (toolLabel === "reason") {
				factParts.push(tags.wrapTag("reason_internal", "[reason — internal]"));
			}

			const combined = (msg.stdout || "") + (msg.stderr || "");
			let hint: string | null = null;
			if (
				msg.exitCode !== 0 &&
				/Cannot find package|Cannot find module|ERR_MODULE_NOT_FOUND|ModuleNotFoundError|No module named/i.test(
					combined,
				)
			) {
				hint = pick(diagnosticHintTemplates, msgIndex + 4);
			}

			return { fact: factParts.join("\n"), hint };
		}
		default: {
			const _exhaustive: never = msg;
			return {
				fact: `Unknown ${toolLabel} status: ${(msg as { status: string }).status}`,
				hint: null,
			};
		}
	}
}
