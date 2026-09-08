/**
 * Code REPL 端到端：同一轮多个 show 全部进入用户可见记录。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { ToolsConfig } from "@n0n/tools";
import type { LLMClient, StreamEvent } from "@n0n/types";
import { startCodeRepl } from "../repl/index.ts";
import type { CodeShowResult } from "../schema.ts";

function makeClient(rounds: CodeShowResult[][]): LLMClient {
	let roundIndex = 0;
	return {
		modelId: "mock-repl-multi",
		async *stream(): AsyncGenerator<StreamEvent> {
			const results = rounds[roundIndex++];
			if (!results) {
				throw new Error("Mock REPL client ran out of rounds");
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

describe("startCodeRepl 多 show", () => {
	test("同一轮多条生产记录全部持久化，随后终态结束", async () => {
		const workspace = mkdtempSync(join(tmpdir(), "n0n-repl-multi-ws-"));
		const sessionDir = mkdtempSync(join(tmpdir(), "n0n-repl-multi-session-"));
		const client = makeClient([
			[
				{ type: "production record", content: "第一条" },
				{ type: "production record", content: "第二条" },
			],
			[{ type: "qualified delivery", content: "交付" }],
		]);
		const toolsConfig: ToolsConfig = {
			security: { blocked_commands: [] },
			agent: { default_exec_waitfor: 10, max_exec_output_tokens: 32_000 },
			platform: process.platform === "win32" ? "win32" : "linux",
			workspace,
			sessionDir,
		};

		await startCodeRepl(resolveBasePaths(workspace), {
			initialInput: "测试多 show",
			exitAfterInitialInput: true,
			client,
			toolsConfig,
			agentConfig: {
				max_iterations: 5,
				max_idle_rounds: 2,
				default_exec_waitfor: 10,
				max_exec_output_tokens: 32_000,
			},
			sessionDir,
			notifyConfig: { enabled: false },
		});

		expect(readdirSync(sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-production-record.md",
				"0003-qualified-delivery.md",
				"current-show.md",
			]),
		);
		expect(readFileSync(join(sessionDir, "current-show.md"), "utf8")).toContain(
			"交付",
		);
	}, 30_000);
});
