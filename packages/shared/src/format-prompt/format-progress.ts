/**
 * show tool result 格式化 — 含 anti-few-shot 变体
 *
 * 返回 FormattedToolResult。show 结果无 hint（纯 fact）。
 */

import type { ShowToolResult } from "@n0n/types";
import type { FormattedToolResult, TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const successTemplates = [
	"Submitted successfully.",
	"Progress received.",
	"Result submitted.",
];

export function formatShowResult(
	_msg: ShowToolResult,
	tags: TagAdapter,
	msgIndex: number,
): FormattedToolResult {
	const text = pick(successTemplates, msgIndex);
	const textWithTag = tags.wrapTag("result", text);
	return { fact: textWithTag, hint: null };
}
