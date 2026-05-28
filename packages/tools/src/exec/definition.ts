/**
 * observe / reason / act 工具定义 — 完全静态
 *
 * 三个工具共享 ExecParamDefs（参数结构）和执行后端（execToolStream），
 * 区分仅靠工具名和 description。
 * 工具描述和参数定义均为静态常量，不依赖任何环境探测结果。
 * 环境信息（可用 runtimes、CLI 工具）由 agent 初始化 fewshot 提供。
 *
 * waitfor 默认值和上限在不同工具间有差异：
 * - observe / reason: 默认 60s, 上限 120s — 轻量、无副作用的读操作
 * - act: 默认 120s, 上限 240s — 可能需要长时间等待的变更操作
 */

import type { ExecArgs, ToolDefinition } from "@n0n/types";
import { ExecArgsSchema, ExecParamDefs, withDescriptions } from "@n0n/types";
import { paramsFromDefs } from "../zod-to-parameters.ts";

export { ExecArgsSchema };

const ALL_RUNTIMES =
	"sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv";

const OBSERVE_DESCRIPTION =
	"Read files, search code, or check environment state. No side effects — use this for gathering information only.";

const REASON_DESCRIPTION =
	"Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user.";

const ACT_DESCRIPTION =
	"Execute actions that change environment state: run tests, build, commit, install dependencies, etc. Actions may be irreversible — verify your reasoning (via reason) before acting.";

function makeExecLikeDefinition(
	platform: "win32" | "darwin" | "linux",
	name: string,
	description: string,
	waitforDefault: number,
	waitforMax: number,
): ToolDefinition {
	const defaultRuntime = platform === "win32" ? "cmd" : "sh";

	const descriptions = {
		script:
			"Script content. Single command or multi-line code with imports, loops, etc.",
		runtime: `Runtime (default: "${defaultRuntime}"). Options: ${ALL_RUNTIMES}. Shell runtimes are generally always available; language runtimes depend on installation — check agent init.`,
		cwd: "Working directory (default: injected workspace root)",
		waitfor: `Max seconds to wait for process (default: ${waitforDefault}, max: ${waitforMax}). Process continues in background if exceeded.`,
	};

	return {
		name,
		description,
		parameters: paramsFromDefs(withDescriptions(ExecParamDefs, descriptions)),
	};
}

export function makeObserveToolDefinition(
	platform: "win32" | "darwin" | "linux",
): ToolDefinition {
	return makeExecLikeDefinition(
		platform,
		"observe",
		OBSERVE_DESCRIPTION,
		60,
		120,
	);
}

export function makeReasonToolDefinition(
	platform: "win32" | "darwin" | "linux",
): ToolDefinition {
	return makeExecLikeDefinition(
		platform,
		"reason",
		REASON_DESCRIPTION,
		60,
		120,
	);
}

export function makeActToolDefinition(
	platform: "win32" | "darwin" | "linux",
): ToolDefinition {
	return makeExecLikeDefinition(platform, "act", ACT_DESCRIPTION, 120, 240);
}
