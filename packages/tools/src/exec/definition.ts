/**
 * observe / reason / act 工具定义 — 完全静态
 *
 * 三个工具共享 ExecParamDefs（参数结构）和执行后端（execToolStream），
 * 通过 ExecRole 区分。工具描述和参数定义均为静态常量，不依赖任何环境探测结果。
 * 环境信息（可用 runtimes、CLI 工具）由首个 user_input 的 context 字段提供。
 *
 * waitfor 默认值和上限在不同 role 间有差异：
 * - observe / reason: 默认 60s, 上限 120s — 轻量、无副作用的读操作
 * - act: 默认 120s, 上限 240s — 可能需要长时间等待的变更操作
 */

import type { ToolDefinition } from "@n0n/types";
import { ExecArgsSchema, ExecParamDefs, withDescriptions } from "@n0n/types";
import { z } from "zod";
import { paramsFromDefs } from "../zod-to-parameters.ts";
import type { ExecRole } from "./role.ts";

export { ExecArgsSchema };

const ALL_RUNTIMES =
	"sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv";
const DEFAULT_OUTPUT_TOKENS = 5_000;

/** ExecRole → 工具描述映射 */
const ROLE_DESCRIPTIONS: Record<ExecRole, string> = {
	observe:
		"Read files, search code, or check environment state. No side effects — use this for gathering information only. Use rg/fd for project discovery, rg/jq/scripts for extraction, and output_tokens when complete bounded output is valuable.",
	reason:
		"Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user.",
	act: "Execute actions that change environment state: run tests, build, commit, install dependencies, etc. Actions may be irreversible — verify your reasoning (via reason) before acting.",
};

/** ExecRole → waitfor 配置 */
const ROLE_WAITFOR: Record<ExecRole, { default: number; max: number }> = {
	observe: { default: 60, max: 120 },
	reason: { default: 60, max: 120 },
	act: { default: 120, max: 240 },
};

export function makeExecToolDefinition(
	platform: "win32" | "darwin" | "linux",
	role: ExecRole,
	maxOutputTokens: number,
): ToolDefinition {
	const defaultRuntime = platform === "win32" ? "cmd" : "sh";
	const waitfor = ROLE_WAITFOR[role];

	const descriptions = {
		script:
			"Script content. Single command or multi-line code with imports, loops, etc.",
		runtime: `Runtime (default: "${defaultRuntime}"). Options: ${ALL_RUNTIMES}.`,
		cwd: "Working directory (default: injected workspace root)",
		waitfor: `Max seconds to wait for process (default: ${waitfor.default}, max: ${waitfor.max}). Process continues in background if exceeded.`,
		output_tokens: `Maximum estimated stdout+stderr tokens returned to the model (default: ${Math.min(DEFAULT_OUTPUT_TOKENS, maxOutputTokens)}, max: ${maxOutputTokens}). Full truncated output is saved as an execution artifact.`,
	};
	const parameters = paramsFromDefs(
		withDescriptions(ExecParamDefs, descriptions),
	);
	const outputTokensProperty = parameters.properties?.output_tokens;
	if (
		outputTokensProperty &&
		typeof outputTokensProperty === "object" &&
		!Array.isArray(outputTokensProperty)
	) {
		(outputTokensProperty as Record<string, unknown>).maximum = maxOutputTokens;
	}

	return {
		name: role,
		description: ROLE_DESCRIPTIONS[role],
		parameters,
	};
}

export function makeExecArgsSchema(maxOutputTokens: number) {
	return ExecArgsSchema.extend({
		output_tokens: z.number().int().positive().max(maxOutputTokens).optional(),
	});
}
