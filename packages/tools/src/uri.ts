/**
 * post 工具 URI 解析 — scheme 注册表的薄分发层
 *
 * `parsePostUri` 是 post 传输层的唯一解析入口（parse-don't-validate 的
 * 边界）：按注册表前缀匹配 scheme，委托各 scheme 模块的 parse。
 * 支持的 scheme 与错误消息由 SCHEMES 单一事实源生成。
 */

import {
  dispatchParse,
  type ParsedUri,
  URI_PREFIXES,
} from "./schemes/index.ts";

export type { ParsedUri } from "./schemes/index.ts";

/**
 * 解析 post 工具的 uri。
 *
 * @throws Error 畸形或不支持的 uri（消息中列出全部受支持的 scheme）。
 */
export function parsePostUri(uri: string): ParsedUri {
  if (typeof uri !== "string" || uri.length === 0) {
    throw new Error(
      `Empty uri. Supported schemes: ${URI_PREFIXES.join(", ")}.`,
    );
  }
  return dispatchParse(uri);
}
