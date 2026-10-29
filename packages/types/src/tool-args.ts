/**
 * 工具参数定义 — 全局领域契约（Single Source of Truth）
 *
 * 唯一工具 `post` 的参数结构。uri 决定后端（exec:// / write:// / customer://），
 * body 是载荷（exec 为代码、write 为完整文件内容、customer 为消息正文）。
 *
 * 参数顺序（uri, body）由 prompt cache 稳定性与 param-order-snapshot 测试固定，
 * 不得调整。
 */

import { z } from "zod";

/**
 * 单个参数定义。不含 description——description 是工具级配置，
 * 由调用方提供。
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
// post — 唯一工具
// ═══════════════════════════════════════════════════════════════

export const PostParamDefs = [
  { name: "uri", schema: z.string() },
  { name: "body", schema: z.string() },
] as const satisfies readonly ParamDef[];

export const PostArgsSchema = buildSchema(PostParamDefs);
export type PostArgs = z.infer<typeof PostArgsSchema>;
