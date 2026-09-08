/**
 * headless 模式同一轮多个 show 的顺序处理。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { LLMClient, StreamEvent } from "@n0n/types";
import { runHeadless } from "../headless.ts";
import type { CodeShowResult } from "../schema.ts";

const agentConfig = {
	max_iterations: 5,
	max_idle_rounds: 2,
	default_exec_waitfor: 10,
	max_exec_output_tokens: 32_000,
};

function makeMultiShowClient(rounds: CodeShowResult[][]): LLMClient {
	let roundIndex = 0;
	return {
		modelId: "mock-headless-multi",
		async *stream(): AsyncGenerator<StreamEvent> {
			const results = rounds[roundIndex++];
			if (!results) {
				throw new Error("Mock headless multi-show client ran out of rounds");
			}
			for (const [index, result] of results.entries()) {
				yield {
					type: "tool_call_delta",
					index,
					id: `show-${roundIndex}-${index}`,
					name: "show",
					arguments: JSON.stringify(result),
				};
			}
			yield { type: "done", finishReason: "tool_calls", usage: null };
		},
		async complete() {
			return { text: "" };
		},
		async ping() {
			return { ok: true };
		},
	};
}

function makeOptions(client: LLMClient) {
	const workspace = mkdtempSync(join(tmpdir(), "n0n-headless-multi-"));
	return {
		instruction: "完成测试订单",
		envContext: "",
		paths: resolveBasePaths(workspace),
		timeoutMs: 5_000,
		client,
		agentConfig,
		securityConfig: { blocked_commands: [] },
	};
}

describe("runHeadless 多 show 生命周期", () => {
	test("同一轮多条生产记录全部持久化，再继续到终态", async () => {
		const result = await runHeadless(
			makeOptions(
				makeMultiShowClient([
					[
						{ type: "production record", content: "第一条" },
						{ type: "production record", content: "第二条" },
					],
					[{ type: "qualified delivery", content: "交付" }],
				]),
			),
		);

		expect(result.success).toBe(true);
		expect(result.rounds).toBe(2);
		expect(result.result?.type).toBe("qualified delivery");
		expect(readdirSync(result.sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-production-record.md",
				"0003-qualified-delivery.md",
				"current-show.md",
			]),
		);
	});

	test("同一轮生产记录与终态时终态优先", async () => {
		const result = await runHeadless(
			makeOptions(
				makeMultiShowClient([
					[
						{ type: "production record", content: "过程" },
						{ type: "production suspended", content: "暂停" },
					],
				]),
			),
		);

		expect(result.success).toBe(false);
		expect(result.rounds).toBe(1);
		expect(result.result?.type).toBe("production suspended");
		expect(readdirSync(result.sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-production-suspended.md",
			]),
		);
	});
});
