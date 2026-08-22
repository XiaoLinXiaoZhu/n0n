/**
 * Code Agent 提示词注册与运行时协议测试。
 */

import { describe, expect, test } from "bun:test";
import { availableVersions, getPrompt } from "../prompts/index.ts";
import { CODE_RUNTIME_PROTOCOL, CODE_TAIL_ANCHOR } from "../tail-anchor.ts";

describe("code prompts", () => {
	test("默认 system prompt 只保留角色定义", () => {
		expect(getPrompt().trim()).toBe(
			"You are a coding agent operating in a local development environment.",
		);
	});

	test("2026-08-21 旧提示词可用于回归对比", () => {
		expect(availableVersions()).toContain("2026-08-21");
		expect(getPrompt("2026-08-21")).toContain(
			"pointing-and-calling verification",
		);
	});

	test("运行时协议随用户请求从 tail hint 注入", () => {
		expect(CODE_TAIL_ANCHOR).toBe(CODE_RUNTIME_PROTOCOL);
		expect(CODE_RUNTIME_PROTOCOL).toContain("<user-request>");
		expect(CODE_RUNTIME_PROTOCOL).toContain("<system-hint>");
		expect(CODE_RUNTIME_PROTOCOL).toContain("<skill>");
	});
});
