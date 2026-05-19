/**
 * ParamDef 列表 + descriptions → ToolDefinition["parameters"] 转换
 *
 * paramsFromDefs: 推荐接口——从 ParamDef 列表生成 JSON Schema，列表即顺序。
 * zodToParameters: 兼容接口——从 Zod schema + FieldDescriptions 生成。
 */

import type { ParamDef, ToolDefinition } from "@n0n/types";
import { toJSONSchema } from "zod";

/**
 * 从 ParamDef 列表生成 ToolDefinition["parameters"]。
 *
 * 列表即顺序——paramDefs[0] 是第一个参数。
 * description 字段如果存在，通过 .describe() 注入 schema 后提取。
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
		const js = toJSONSchema(schema);
		properties[def.name] = js;
		if (def.required) required.push(def.name);
	}

	return {
		type: "object",
		properties,
		required: required.length > 0 ? required : undefined,
		additionalProperties: false,
	} satisfies ToolDefinition["parameters"];
}

// ── 兼容接口 ──

import { type z } from "zod";

export type FieldDescriptions<T> = { [K in keyof Required<T>]: string };

export function zodToParameters<S extends z.ZodObject>(
	schema: S,
	descriptions: FieldDescriptions<z.infer<S>>,
): ToolDefinition["parameters"] {
	const extensions: Record<string, z.ZodType> = {};
	for (const [key, desc] of Object.entries(descriptions)) {
		extensions[key] = (schema.shape[key] as z.ZodType).describe(desc as string);
	}
	const described = schema.extend(extensions);
	const js = toJSONSchema(described);
	return {
		type: "object",
		properties: js.properties as Record<string, unknown>,
		required: js.required as string[],
		additionalProperties: false,
	} satisfies ToolDefinition["parameters"];
}
