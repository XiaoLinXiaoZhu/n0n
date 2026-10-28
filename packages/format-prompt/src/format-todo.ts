/**
 * todo:// 结果格式化 — 含 anti-few-shot 变体
 *
 * 返回 FormattedToolResult。todo 结果无 hint（纯 fact）。
 */

import type { TodoToolResult } from "@n0n/types";
import type { FormattedToolResult, TagAdapter } from "./utils.ts";
import { pick } from "./utils.ts";

const successTemplates = [
	"Todo list saved.",
	"Plan updated.",
	"Progress recorded.",
];

export function formatTodoResult(
	_msg: TodoToolResult,
	tags: TagAdapter,
	msgIndex: number,
): FormattedToolResult {
	const text = pick(successTemplates, msgIndex);
	const textWithTag = tags.wrapTag("result", text);
	return { fact: textWithTag, hint: null };
}
