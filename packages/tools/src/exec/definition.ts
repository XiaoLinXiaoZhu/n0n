/**
 * post 工具定义 — 由 scheme 注册表组装，完全静态
 *
 * 唯一工具 `post`，uri scheme 路由到各后端。scheme 段落由 SCHEMES
 * 逐个 describe 生成——新增 scheme 无需改本文件，只需在注册表加行。
 *
 * 描述只陈述接口事实：各 scheme 的 uri 模板、body 语义、有无副作用、
 * 调用如何被执行。检索方法、输出预算的使用策略等属于行为规范，由
 * self-function 标准承载，不在此重复——同一件事写在两处会随修订逐渐不一致。
 *
 * 参数定义不依赖环境探测结果；环境信息（可用 runtimes、CLI 工具）由首个
 * user_input 的 context 字段提供。
 *
 * waitfor 与输出预算的默认值由实际配置传入（而非在此写死），
 * 使描述与运行时行为始终一致，包括用户在配置文件中改动默认值的情况。
 */

import type { ToolDefinition } from "@n0n/types";
import { PostArgsSchema, PostParamDefs, withDescriptions } from "@n0n/types";
import { SCHEMES } from "../schemes/index.ts";
import type { SchemeContext } from "../schemes/types.ts";
import { paramsFromDefs } from "../zod-to-parameters.ts";

export { PostArgsSchema };

/**
 * 执行语义说明。
 *
 * 调度器按 enqueue 顺序取队首执行（见 core/agent/scheduler.ts），因此提交顺序
 * 即执行顺序。说明这一点是为了避免为"等待上一步"而无谓地拆分响应。
 */
const EXECUTION_ORDER_NOTE =
	"Calls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.";

const NUM_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];

export function makePostToolDefinition(ctx: SchemeContext): ToolDefinition {
	// 可见 scheme 的描述段落，注册序 = 呈现序（prompt cache 稳定性依赖此顺序）
	const visibleSections = SCHEMES.flatMap((s) => s.describe(ctx));
	const schemeSection = [
		`${NUM_WORDS[visibleSections.length] ?? visibleSections.length} uri schemes route this tool to different backends:`,
		"",
		...visibleSections,
	].join("\n");

	const schemeNames = SCHEMES.map((s) => s.scheme).join(" / ");
	const bodyHints = SCHEMES.map((s) => s.bodyHint).join(", ");
	const descriptions = {
		uri: `The target address. Its scheme (${schemeNames}) decides which backend runs and how body is interpreted — see the tool description for the uri template of each scheme.`,
		body: `The payload. ${bodyHints}.`,
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
