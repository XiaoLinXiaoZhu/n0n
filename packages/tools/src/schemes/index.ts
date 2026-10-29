/**
 * scheme 注册表 — 静态组合，顺序即描述顺序
 *
 * post 传输层（工具入口）只依赖本文件；新增 scheme =
 * 新建模块 + 在 SCHEMES 中加一行（types 联合成员与下游 switch
 * 由编译器穷尽检查引导补齐）。
 *
 * 顺序被 prompt cache 稳定性约束 pin 住——不得随意重排。
 */

import type { ParsedCustomer } from "./customer.ts";
import { customerScheme } from "./customer.ts";
import type { ParsedExec } from "./exec.ts";
import { execScheme } from "./exec.ts";
import type { ParsedTodo } from "./todo.ts";
import { todoScheme } from "./todo.ts";
import type { SchemeHandler } from "./types.ts";
import type { ParsedWrite } from "./write.ts";
import { writeScheme } from "./write.ts";

export type ParsedUri = ParsedExec | ParsedWrite | ParsedCustomer | ParsedTodo;

/** 注册表成员的擦除类型（内部统一分发用） */
export type AnySchemeHandler = SchemeHandler<{ scheme: string }>;

/**
 * 全部 scheme，顺序 = 描述顺序 = prompt 中的呈现顺序。
 * 新 scheme 加在此数组尾部（不要插入中间——会破坏 prompt cache）。
 */
export const SCHEMES = [
  execScheme,
  writeScheme,
  customerScheme,
  todoScheme,
] as const satisfies readonly AnySchemeHandler[];

/** scheme 字面量 → handler 查表 */
const BY_SCHEME = new Map<string, AnySchemeHandler>(
  SCHEMES.map((s) => [s.scheme, s]),
);

/** uri 前缀列表（错误消息的单一事实源） */
export const URI_PREFIXES: readonly string[] = SCHEMES.map((s) => s.uriPrefix);

/** 按 scheme 字面量查 handler；未知 scheme 返回 undefined */
export function schemeFor(scheme: string): AnySchemeHandler | undefined {
  return BY_SCHEME.get(scheme);
}

/** 查表解析：按前缀匹配 scheme 并委托其 parse。未知 scheme 抛错。 */
export function dispatchParse(uri: string): ParsedUri {
  const schemeEnd = uri.indexOf("://");
  if (schemeEnd === -1) {
    throw new Error(
      `Malformed uri "${uri}". Expected scheme://... — supported schemes: ${URI_PREFIXES.join(", ")}.`,
    );
  }
  const scheme = uri.slice(0, schemeEnd).toLowerCase();
  const handler = BY_SCHEME.get(scheme);
  if (!handler) {
    throw new Error(
      `Unsupported uri scheme "${scheme}:" in "${uri}". Supported schemes: ${URI_PREFIXES.join(", ")}.`,
    );
  }
  // SchemeHandler 的 parse 由具体 P 约束；擦除类型下此处即分发点，
  // 返回值经 SCHEME 联合收窄回 ParsedUri。
  return handler.parse(uri.slice(schemeEnd + 3), uri) as ParsedUri;
}
