/**
 * customer:// 结果格式化 — 含 anti-few-shot 变体
 *
 * 返回 FormattedToolResult。customer 结果无 hint（纯 fact）。
 */

import type { CustomerCompleted } from "@n0n/types";

import type { FormattedToolResult, TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const successTemplates = [
  "Submitted successfully.",
  "Progress received.",
  "Result submitted.",
];

export function formatCustomerResult(
  _msg: CustomerCompleted,
  tags: TagAdapter,
  msgIndex: number,
): FormattedToolResult {
  const text = pick(successTemplates, msgIndex);
  const textWithTag = tags.wrapTag("result", text);
  return { fact: textWithTag, hint: null };
}
