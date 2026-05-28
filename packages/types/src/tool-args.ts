/**
 * 工具参数定义 — 全局领域契约（Single Source of Truth）
 *
 * 每个工具的参数定义为 **参数列表**（const array）。
 * 列表即顺序——数组天然有序，顺序是结构的一部分。
 *
 * 列表中的项仅包含：name、schema、required。
 * description 是消费方配置数据，通过 withDescriptions() 按 name 附加。
 *
 * Zod schema、TypeScript 类型从列表派生。
 */

import { z } from "zod";

/**
 * 单个参数定义。不含 description——description 是工具级配置，
 * 由调用方提供（不同的 observe/reason/act 可有不同的默认值描述）。
 */
export interface ParamDef<
	Name extends string = string,
	S extends z.ZodType = z.ZodType,
> {
	readonly name: Name;
	readonly schema: S;
}

/** 从 ParamDef 列表派生 Zod object shape 类型 */
export type InferShape<T extends readonly ParamDef[]> = {
	-readonly [K in T[number] as K["name"]]: K["schema"];
};

/** 从 ParamDef 列表构建 Zod object schema（类型安全） */
export function buildSchema<T extends readonly ParamDef[]>(defs: T) {
	const shape = Object.fromEntries(
		defs.map((d) => [d.name, d.schema]),
	) as InferShape<T>;
	return z.object(shape);
}

/** description 映射：key = ParamDef.name, value = LLM 可见描述 */
export type ParamDescriptions<T extends readonly ParamDef[]> = {
	[K in T[number] as K["name"]]: string;
};

/**
 * 将 descriptions 按 name 附加到 param defs 上。
 * 返回 { name, schema, required, description }[]，可直接传给 paramsFromDefs()。
 */
export function withDescriptions<T extends readonly ParamDef[]>(
	defs: T,
	descriptions: ParamDescriptions<T>,
): (T[number] & { description: string })[] {
	return defs.map((d) => ({
		...d,
		description: (descriptions as Record<string, string>)[d.name],
	})) as (T[number] & { description: string })[];
}

// ═══════════════════════════════════════════════════════════════
// exec (observe / reason / act 共用)
// ═══════════════════════════════════════════════════════════════

export const ExecParamDefs = [
	{ name: "runtime", schema: z.string().optional() },
	{ name: "cwd", schema: z.string().optional() },
	// prompt cache 的 TTL 为 5 分钟
	{
		name: "waitfor",
		schema: z.number().max(240).optional(),
	},
	{ name: "script", schema: z.string() },
] as const satisfies readonly ParamDef[];

export const ExecArgsSchema = buildSchema(ExecParamDefs);
export type ExecArgs = z.infer<typeof ExecArgsSchema>;

// ═══════════════════════════════════════════════════════════════
// write
// ═══════════════════════════════════════════════════════════════

export const WriteParamDefs = [
	{ name: "path", schema: z.string() },
	{ name: "content", schema: z.string() },
] as const satisfies readonly ParamDef[];

export const WriteArgsSchema = buildSchema(WriteParamDefs);
export type WriteArgs = z.infer<typeof WriteArgsSchema>;

// ═══════════════════════════════════════════════════════════════
// edit (shadow edit — 意图驱动)
// ═══════════════════════════════════════════════════════════════

export const EditParamDefs = [
	{ name: "path", schema: z.string() },
	{ name: "intent", schema: z.string() },
] as const satisfies readonly ParamDef[];

export const EditArgsSchema = buildSchema(EditParamDefs);
export type EditArgs = z.infer<typeof EditArgsSchema>;

// ═══════════════════════════════════════════════════════════════
// progress
// ═══════════════════════════════════════════════════════════════

export const ProgressParamDefs = [
	{ name: "status", schema: z.string() },
	{ name: "content", schema: z.string() },
] as const satisfies readonly ParamDef[];

export const ProgressArgsSchema = buildSchema(ProgressParamDefs);
export type ProgressArgs = z.infer<typeof ProgressArgsSchema>;
