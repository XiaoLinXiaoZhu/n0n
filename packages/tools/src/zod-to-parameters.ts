/**
 * ParamDef 列表 → ToolDefinition["parameters"] 转换
 *
 * 从 ParamDef 列表生成 JSON Schema。列表即顺序。
 * description 字段如果存在，通过 .describe() 注入 schema 后提取。
 *
 * 输出的 property schema 中移除了 $schema 元数据字段——
 * 它是 Zod toJSONSchema 的产物，对 LLM 来说是纯噪音（每个属性 +21 tokens）。
 */

import type { ParamDef, ToolDefinition } from "@n0n/types";
import { toJSONSchema } from "zod";

/**
 * 从 ParamDef 列表生成 ToolDefinition["parameters"]。
 *
 * 列表即顺序——paramDefs[0] 是第一个参数。
 */
export function paramsFromDefs(
	defs: readonly (ParamDef & { description?: string })[],
): ToolDefinition["parameters"] {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const def of defs) {
		const schema = def.description
			? def.schema.describe(def.description)
			: def.schema;
		const js = toJSONSchema(schema) as Record<string, unknown>;
		// 移除 $schema 元数据——LLM 不需要它，节省 token
		delete js.$schema;
		properties[def.name] = js;
		if (!def.schema.isOptional()) required.push(def.name);
	}

	return {
		type: "object",
		properties,
		required: required.length > 0 ? required : undefined,
		additionalProperties: false,
	} satisfies ToolDefinition["parameters"];
}
