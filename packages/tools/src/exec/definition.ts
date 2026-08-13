/**
 * observe / reason / act 工具定义 — 完全静态
 *
 * 三个工具共享 ExecParamDefs（参数结构）和执行后端（execToolStream），
 * 通过 ExecRole 区分。参数定义不依赖环境探测结果；环境信息（可用 runtimes、
 * CLI 工具）由首个 user_input 的 context 字段提供。
 *
 * 描述只陈述接口事实：工具做什么、有无副作用、调用如何被执行。
 * 检索方法、输出预算的使用策略等属于行为规范，由 self-function 标准承载，
 * 不在此重复——同一件事写在两处会随修订逐渐不一致。
 *
 * waitfor 与 output_tokens 的默认值由实际配置传入（而非在此写死），
 * 使描述与运行时行为始终一致，包括用户在配置文件中改动默认值的情况。
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

/** waitfor 硬上限，与 ExecParamDefs 中的 schema 约束保持一致 */
const WAITFOR_MAX = 240;

/** ExecRole → 工具描述映射（各自的能力与副作用） */
const ROLE_DESCRIPTIONS: Record<ExecRole, string> = {
	observe:
		"Read files, search code, or inspect environment state. No side effects — this tool only gathers information.",
	reason:
		"Structured thinking, data processing, or hypothesis verification. No side effects — the output feeds your own reasoning and is not shown to the user.",
	act: "Execute actions that change state: run tests, build, install dependencies, version control operations. Effects are real and may be irreversible.",
};

/**
 * 三个工具共用的执行语义说明。
 *
 * 调度器按 enqueue 顺序取队首执行（见 core/agent/scheduler.ts），因此提交顺序
 * 即执行顺序。说明这一点是为了避免为"等待上一步"而无谓地拆分响应。
 */
const EXECUTION_ORDER_NOTE =
	"Calls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.";

export function makeExecToolDefinition(
	platform: "win32" | "darwin" | "linux",
	role: ExecRole,
	maxOutputTokens: number,
	defaultWaitfor: number,
): ToolDefinition {
	const defaultRuntime = platform === "win32" ? "cmd" : "sh";

	const descriptions = {
		script:
			"Script content. Single command or multi-line code with imports, loops, etc.",
		runtime: `Runtime (default: "${defaultRuntime}"). Options: ${ALL_RUNTIMES}.`,
		cwd: "Working directory (default: injected workspace root)",
		waitfor: `Max seconds to wait for the process (default: ${defaultWaitfor}, max: ${WAITFOR_MAX}). Exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. Set this explicitly when you expect the command to take longer.`,
		output_tokens: `Maximum estimated stdout+stderr tokens returned to the model (default: ${Math.min(DEFAULT_OUTPUT_TOKENS, maxOutputTokens)}, max: ${maxOutputTokens}). The budget covers both streams combined. Full output is saved as an execution artifact when truncated.`,
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
		description: `${ROLE_DESCRIPTIONS[role]}\n\n${EXECUTION_ORDER_NOTE}`,
		parameters,
	};
}

export function makeExecArgsSchema(maxOutputTokens: number) {
	return ExecArgsSchema.extend({
		output_tokens: z.number().int().positive().max(maxOutputTokens).optional(),
	});
}
