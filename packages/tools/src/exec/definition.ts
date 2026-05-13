/**
 * exec 工具定义 — 完全静态
 *
 * 工具描述和参数定义均为静态常量，不依赖任何环境探测结果。
 * 环境信息（可用 runtimes、CLI 工具）由 bootstrap fewshot 提供。
 */

import type { ExecArgs, ToolDefinition } from "@n0n/types";
import { ExecArgsSchema } from "@n0n/types";
import {
	type FieldDescriptions,
	zodToParameters,
} from "../zod-to-parameters.ts";

export { ExecArgsSchema };

const STATIC_DESCRIPTION = `Execute a script. Content is written to a temp file and run with the specified runtime. Returns stdout, stderr, and exit code.

Runtimes and CLI tools available in the current environment are listed in the bootstrap context above — use them directly without probing.

Output exceeding ~4 000 tokens is auto-truncated: only the last ~1 000 tokens are kept and the full output is saved to a file. To avoid losing important content, assess first then read selectively, or split across parallel tool calls.`;

const ALL_RUNTIMES =
	"sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv";

function makeExecLikeDefinition(
	platform: "win32" | "darwin" | "linux",
	name: string,
	description: string,
): ToolDefinition {
	const defaultRuntime = platform === "win32" ? "cmd" : "sh";

	const EXEC_FIELD_DESCRIPTIONS: FieldDescriptions<ExecArgs> = {
		script:
			"Script content. Single command or multi-line code with imports, loops, etc.",
		runtime: `Runtime (default: "${defaultRuntime}"). Options: ${ALL_RUNTIMES}. Shell runtimes are generally always available; language runtimes depend on installation — check bootstrap context.`,
		cwd: "Working directory (default: injected workspace root)",
		waitfor:
			"Max seconds to wait for process (default: 120, max: 240). Process continues in background if exceeded.",
	};

	const PARAMETERS = zodToParameters(ExecArgsSchema, EXEC_FIELD_DESCRIPTIONS);

	return { name, description, parameters: PARAMETERS };
}

export function makeExecToolDefinition(platform: "win32" | "darwin" | "linux"): ToolDefinition {
	return makeExecLikeDefinition(platform, "exec", STATIC_DESCRIPTION);
}

export function makeObserveToolDefinition(platform: "win32" | "darwin" | "linux"): ToolDefinition {
	return makeExecLikeDefinition(platform, "observe",
		"Read files, search code, or check environment state. No side effects — use this for gathering information only.");
}

export function makeReasonToolDefinition(platform: "win32" | "darwin" | "linux"): ToolDefinition {
	return makeExecLikeDefinition(platform, "reason",
		"Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user.");
}

export function makeActToolDefinition(platform: "win32" | "darwin" | "linux"): ToolDefinition {
	return makeExecLikeDefinition(platform, "act",
		"Execute actions that change environment state: run tests, build, commit, install dependencies, etc.");
}
