/**
 * format-todo 单元测试
 *
 * 验证 todo:// 结果 → 提示词的格式化：
 * - 成功结果 → <result> 包裹的 fact，无 hint
 * - anti-few-shot：不同 index 产生不同表述，同 index 稳定
 */

import { describe, expect, it } from "bun:test";
import type { TagAdapter, TodoCompleted } from "@n0n/types";
import { formatTodoResult } from "../format-todo.ts";

// TagAdapter mock
const tags: TagAdapter = {
	wrapTag: (name: string, content: string) =>
		`<${name}>\n${content}\n</${name}>`,
	adaptTags: (content: string) => content,
};

function makeTodo(goal: string, path: string): TodoCompleted {
	return {
		type: "tool_result",
		tool: "post",
		scheme: "todo",
		goal,
		path,
		status: "completed",
		call: {
			id: "call_01",
			tool: "post",
			args: { uri: `todo://${goal}`, body: "- [ ] first" },
		},
	};
}

describe("formatTodoResult", () => {
	it("应返回 <result> 包裹的 fact 和 null hint", () => {
		const result = formatTodoResult(
			makeTodo("refactor-auth", "/session/todo/refactor-auth.md"),
			tags,
			0,
		);

		expect(result.fact).toContain("<result>");
		expect(result.fact).toContain("</result>");
		expect(result.hint).toBeNull();
	});

	it("anti-few-shot：不同 index 产生不同表述", () => {
		const msg = makeTodo("refactor-auth", "/session/todo/refactor-auth.md");
		const r0 = formatTodoResult(msg, tags, 0);
		const r1 = formatTodoResult(msg, tags, 1);
		const r2 = formatTodoResult(msg, tags, 2);
		expect(r0.fact).not.toBe(r1.fact);
		expect(r1.fact).not.toBe(r2.fact);
		expect(r0.fact).not.toBe(r2.fact);
	});

	it("稳定性：同 index 多次调用结果一致", () => {
		const msg = makeTodo("refactor-auth", "/session/todo/refactor-auth.md");
		const a = formatTodoResult(msg, tags, 5);
		const b = formatTodoResult(msg, tags, 5);
		expect(a.fact).toBe(b.fact);
	});
});
