import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { LLMClient, StreamEvent, StreamRequest } from "@n0n/types";
import { runHeadless } from "../headless.ts";
import type { CodeShowResult } from "../schema.ts";

const agentConfig = {
	max_iterations: 5,
	max_idle_rounds: 2,
	default_exec_waitfor: 10,
	max_exec_output_tokens: 32_000,
};

function makeClient(
	results: CodeShowResult[],
	onRequest?: (request: StreamRequest) => void,
): LLMClient {
	let index = 0;
	return {
		modelId: "mock-headless",
		async *stream(request): AsyncGenerator<StreamEvent> {
			onRequest?.(request);
			const result = results[index++];
			if (!result) {
				throw new Error("Mock headless client ran out of show results");
			}
			const callId = `show-${index}`;
			yield {
				type: "tool_call_delta",
				index: 0,
				id: callId,
				name: "show",
				arguments: "",
			};
			yield {
				type: "tool_call_delta",
				index: 0,
				arguments: JSON.stringify(result),
			};
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
	const workspace = mkdtempSync(join(tmpdir(), "n0n-headless-"));
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

describe("runHeadless show lifecycle", () => {
	test("只暴露无需后续客户参与的类型，并持久化生产记录和终态", async () => {
		let exposedTypes: string[] = [];
		const client = makeClient(
			[
				{ type: "production record", content: "阶段证据" },
				{ type: "production suspended", content: "等待外部条件" },
			],
			(request) => {
				const show = request.tools?.find((tool) => tool.name === "show");
				const typeProperty = show?.parameters.properties?.type as
					| { enum?: string[] }
					| undefined;
				exposedTypes = typeProperty?.enum ?? [];
			},
		);

		const result = await runHeadless(makeOptions(client));

		expect(exposedTypes).toEqual([
			"production record",
			"qualified delivery",
			"production suspended",
			"production failed",
			"customer cancelled",
		]);
		expect(result.rounds).toBe(2);
		expect(result.success).toBe(false);
		expect(result.result?.type).toBe("production suspended");
		expect(readdirSync(result.sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-production-suspended.md",
				"current-show.md",
			]),
		);
		expect(
			readFileSync(join(result.sessionDir, "current-show.md"), "utf8"),
		).toContain("等待外部条件");
	});

	test("只有合格交付映射为机械 success", async () => {
		const qualified = await runHeadless(
			makeOptions(
				makeClient([{ type: "qualified delivery", content: "全部验收通过" }]),
			),
		);
		const failed = await runHeadless(
			makeOptions(
				makeClient([{ type: "production failed", content: "无有效路径" }]),
			),
		);

		expect(qualified.success).toBe(true);
		expect(qualified.error).toBeNull();
		expect(failed.success).toBe(false);
		expect(failed.error).toBe("Quality terminal state: production failed");
	});
});
