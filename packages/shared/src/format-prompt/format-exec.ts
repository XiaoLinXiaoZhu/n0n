/**
 * exec tool result 格式化 — 含 anti-few-shot 变体
 *
 * 多部分拼装（meta、stdout/stderr tag、hint 等）各自使用
 * msgIndex+N 偏移独立选择变体，组合爆炸产生远超单维度的多样性。
 *
 * 返回 FormattedToolResult：fact（客观数据）与 hint（系统操作建议）分离。
 * fact = 模型未来可能用到且不会过时的信息（状态、PID、文件路径、分块数据等）
 * hint = 仅当前轮有用的操作建议，隔一轮就不需要了
 */

import type { ExecToolResult } from "@n0n/types";
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

/** backgrounded fact 模板：包含 PID 和 log file 路径（持久有效的客观信息） */
const backgroundedFactTemplates = [
	(pid: number, logFile: string) =>
		`Process exceeded waitfor limit, moved to background.\nPID: ${pid}\nLog file: ${logFile}`,
	(pid: number, logFile: string) =>
		`Waitfor exceeded — process continues in background (PID ${pid}).\nOutput is being logged to: ${logFile}`,
	(pid: number, logFile: string) =>
		`Background process started (PID: ${pid}).\nThe command exceeded its waitfor limit but is still running.\nLog file: ${logFile}`,
];

/** backgrounded hint 模板：操作建议（隔轮后不需要） */
const backgroundedHintTemplates = [
	"The log file is updated every few seconds — read it anytime to check output and process status.\nBefore continuing other tasks, decide whether this process still needs to run in the background. If not, kill it by PID — do not leave it running unattended.",
	"The file syncs every few seconds — check it anytime for progress and status.\nBefore moving on, judge whether you still need this process running. If not, terminate it by PID rather than leaving it idle.",
	"Log file updates every few seconds; read it to check progress.\nDecide now: does this process need to keep running? If not, kill it by PID. Do not leave background processes running without purpose.",
];

/** 格式化截断分块的读取建议（fact 部分：客观分块数据） */
function formatChunkGuide(
	chunks: { startLine: number; endLine: number; tokens: number }[],
	outputFile: string,
): string {
	if (chunks.length === 0) return "";
	if (chunks.length === 1) {
		const c = chunks[0];
		if (!c) return "";
		return `Truncated part: lines ${c.startLine}-${c.endLine} (~${c.tokens} tokens) — small enough to read in one go if needed.`;
	}
	const lines = chunks.map(
		(c, i) =>
			`  chunk ${i + 1}: lines ${c.startLine}-${c.endLine} (~${c.tokens} tok)`,
	);
	return `Truncated part can be read in ${chunks.length} chunks:\n${lines.join("\n")}`;
}

/** truncated fact 模板：输出文件路径和分块信息（持久有效） */
const truncatedFactTemplates = [
	(totalLines: number, outputFile: string, chunkGuide: string) =>
		`Full output (${totalLines} lines) saved to: ${outputFile}${chunkGuide ? `\n${chunkGuide}` : ""}`,
	(totalLines: number, outputFile: string, chunkGuide: string) =>
		`${totalLines} lines captured in ${outputFile}.${chunkGuide ? `\n${chunkGuide}` : ""}`,
	(totalLines: number, outputFile: string, chunkGuide: string) =>
		`Complete output saved to ${outputFile} (${totalLines} lines).${chunkGuide ? `\n${chunkGuide}` : ""}`,
];

/** truncated hint 模板：操作建议（隔轮后不需要） */
const truncatedHintTemplates = [
	`${IS_WINDOWS ? `Use pwsh -c "Get-Content <file> | Select-Object -Skip <start-1> -First <count>" to read a specific chunk.` : `Use sed -n '<start>,<end>p' <file> to read a specific chunk.`}\nOr write a script to extract key information — do NOT ${IS_WINDOWS ? "type" : "cat"} the full file.`,
	`Prefer writing a script to extract what you need rather than reading raw output.${IS_WINDOWS ? `\nUse pwsh Select-Object for targeted reads.` : `\nUse sed for targeted reads.`}`,
	`Use targeted reads or a script — avoid re-dumping the full file.`,
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
	// 每个 pick 点用不同偏移：meta=+0, stdoutTag=+1, stderrTag=+2, notice/hint=+3, diagnostic=+4
	const stdoutTag = pick(stdoutTagNames, msgIndex + 1);
	const stderrTag = pick(stderrTagNames, msgIndex + 2);

	switch (msg.status) {
		case "backgrounded": {
			const metaFn = pick(backgroundedMetaTemplates, msgIndex);
			const factParts = [
				tags.wrapTag("exec_meta", metaFn(runtime, cwd, msg.durationMs)),
			];

			// PID + log file 路径：持久有效的客观信息，属于 fact
			const noticeFn = pick(backgroundedFactTemplates, msgIndex + 3);
			factParts.push(
				tags.wrapTag("waitfor_notice", noticeFn(msg.pid, msg.logFile)),
			);

			if (msg.stdoutSoFar)
				factParts.push(tags.wrapTag(stdoutTag, msg.stdoutSoFar));
			if (msg.stderrSoFar)
				factParts.push(tags.wrapTag(stderrTag, msg.stderrSoFar));

			// 操作建议：隔轮后不需要
			const hint = pick(backgroundedHintTemplates, msgIndex + 4);

			return { fact: factParts.join("\n"), hint };
		}
		case "truncated": {
			const metaFn = pick(truncatedMetaTemplates, msgIndex);
			const factParts = [
				tags.wrapTag(
					"exec_meta",
					metaFn(runtime, cwd, msg.exitCode, msg.durationMs, msg.outputFile),
				),
			];

			if (msg.stdoutTail)
				factParts.push(
					tags.wrapTag(
						stdoutTag,
						`... (last ${msg.totalLines - msg.tailStartLine + 1} of ${msg.totalLines} lines)\n${msg.stdoutTail}`,
					),
				);
			if (msg.stderrTail)
				factParts.push(
					tags.wrapTag(stderrTag, `... (truncated)\n${msg.stderrTail}`),
				);

			// 输出文件路径和分块信息：持久有效，属于 fact
			const chunkGuide = formatChunkGuide(msg.truncatedChunks, msg.outputFile);
			const truncFactFn = pick(truncatedFactTemplates, msgIndex + 3);
			factParts.push(
				tags.wrapTag(
					"output_info",
					truncFactFn(msg.totalLines, msg.outputFile, chunkGuide),
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
					"exec_meta",
					metaFn(runtime, cwd, msg.exitCode, msg.durationMs),
				),
			];

			if (msg.stdout) factParts.push(tags.wrapTag(stdoutTag, msg.stdout));
			if (msg.stderr) factParts.push(tags.wrapTag(stderrTag, msg.stderr));

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
			// biome-ignore lint/suspicious/noExplicitAny: exhaustive switch default
			return { fact: `Unknown exec status: ${(msg as any).status}`, hint: null };
		}
	}
}
