/**
 * post 工具定义 — 完全静态
 *
 * 唯一工具 `post`，通过 uri scheme 路由到三种后端：
 * - exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_tokens=… — 执行代码
 * - write://<path> — 写入完整文件内容
 * - customer://question|form|action_required — 向客户提问，中断循环等待
 *
 * 参数定义不依赖环境探测结果；环境信息（可用 runtimes、CLI 工具）由首个
 * user_input 的 context 字段提供。
 *
 * 描述只陈述接口事实：各 scheme 的 uri 模板、body 语义、有无副作用、
 * 调用如何被执行。检索方法、输出预算的使用策略等属于行为规范，由
 * self-function 标准承载，不在此重复——同一件事写在两处会随修订逐渐不一致。
 *
 * waitfor 与输出预算的默认值由实际配置传入（而非在此写死），
 * 使描述与运行时行为始终一致，包括用户在配置文件中改动默认值的情况。
 */

import type { ToolDefinition } from "@n0n/types";
import { PostArgsSchema, PostParamDefs, withDescriptions } from "@n0n/types";
import { paramsFromDefs } from "../zod-to-parameters.ts";

export { PostArgsSchema };

const ALL_RUNTIMES =
	"sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv";
const DEFAULT_OUTPUT_TOKENS = 5_000;

/** waitfor 硬上限，与 uri 解析的约束保持一致 */
const WAITFOR_MAX = 240;

/**
 * 执行语义说明。
 *
 * 调度器按 enqueue 顺序取队首执行（见 core/agent/scheduler.ts），因此提交顺序
 * 即执行顺序。说明这一点是为了避免为"等待上一步"而无谓地拆分响应。
 */
const EXECUTION_ORDER_NOTE =
	"Calls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.";

export function makePostToolDefinition(
	platform: "win32" | "darwin" | "linux",
	maxOutputTokens: number,
	defaultWaitfor: number,
	/** false 时不在描述中提供 customer://（headless 场景），默认 true */
	allowCustomer = true,
): ToolDefinition {
	const defaultRuntime = platform === "win32" ? "cmd" : "sh";

	const schemeSection = [
		"Three uri schemes route this tool to different backends:",
		"",
		`exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_tokens=… . Body is code (a single command or multi-line script with imports, loops, etc.). Runtime options: ${ALL_RUNTIMES} (default: "${defaultRuntime}"). <NAME> is your own short label for what this step is doing (e.g. read-config). cwd is the working directory (default: injected workspace root). waitfor is max seconds to wait (default: ${defaultWaitfor}, max: ${WAITFOR_MAX}); exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. max_output_tokens caps the estimated stdout+stderr tokens returned to you (default: ${Math.min(
			DEFAULT_OUTPUT_TOKENS,
			maxOutputTokens,
		)}, max: ${maxOutputTokens}); the budget covers both streams combined and full output is saved as an execution artifact when truncated.`,
		"write — write://<path> . Body is the complete file content; the file is created or overwritten at <path> (relative paths resolve against the workspace root). write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.",
		...(allowCustomer
			? [
					"customer — customer://question | customer://form | customer://action_required . Body is the message to the customer. This interrupts the agent loop and waits for the customer to respond. question is a multiple-choice question with a recommended pick; form requests specific information; action_required is something the customer must do.",
				]
			: []),
	].join("\n");

	const descriptions = {
		uri: "The target address. Its scheme (exec / write / customer) decides which backend runs and how body is interpreted — see the tool description for the uri template of each scheme.",
		body: "The payload. Code for exec://, the complete file content for write://, the message text for customer://.",
	};
	const parameters = paramsFromDefs(
		withDescriptions(PostParamDefs, descriptions),
	);

	return {
		name: "post",
		description: `${schemeSection}\n\n${EXECUTION_ORDER_NOTE}`,
		parameters,
	};
}

/**
 * post 参数 schema。body 无 token 上限（uri 中的 max_output_tokens 约束
 * exec 输出，而非 body 本身），因此直接 re-export PostArgsSchema；
 * 输出预算的 clamp 在 executor 内完成。
 */
export function makePostArgsSchema(_maxOutputTokens: number) {
	return PostArgsSchema;
}
