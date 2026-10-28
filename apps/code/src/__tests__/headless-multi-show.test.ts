/**
 * headless 多轮工具执行 → 自然结束。
 *
 * 同一轮 agentLoop 内连续执行多个 post write:// 写入，
 * 最终以纯内容自然结束；最终文本来自 history 最后一条 assistant_text。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { LLMClient, StreamEvent } from "@n0n/types";
import { runHeadless } from "../headless.ts";

const agentConfig = {
	max_iterations: 5,
	max_idle_rounds: 2,
	default_exec_waitfor: 10,
	max_exec_output_tokens: 32_000,
};

type Turn = StreamEvent[];

function postTurn(id: string, uri: string, body: string): Turn {
	return [
		{ type: "tool_call_delta", index: 0, id, name: "post", arguments: "" },
		{
			type: "tool_call_delta",
			index: 0,
			arguments: JSON.stringify({ uri, body }),
		},
		{ type: "done", finishReason: "tool_calls", usage: null },
	];
}

function contentTurn(text: string): Turn {
	return [
		{ type: "content", text },
		{ type: "done", finishReason: "stop", usage: null },
	];
}

/** LLM 流错误轮 → 错误 report 终止 */
function errorTurn(message: string): Turn {
	return [
		{ type: "error", error: message },
		{ type: "done", finishReason: "stop", usage: null },
	];
}

function makeMultiRoundClient(turns: Turn[]): LLMClient {
	let roundIndex = 0;
	return {
		modelId: "mock-headless-multi",
		async *stream(): AsyncGenerator<StreamEvent> {
			const turn = turns[roundIndex++];
			if (!turn) {
				throw new Error("Mock headless multi-round client ran out of turns");
			}
			yield* turn;
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
		options: {
			instruction: "完成测试订单",
			envContext: "",
			paths: resolveBasePaths(workspace),
			timeoutMs: 5_000,
			client,
			agentConfig,
			securityConfig: { blocked_commands: [] },
		},
		workspace,
	};
}

describe("runHeadless 多轮执行生命周期", () => {
	test("多轮 write:// 写入全部落盘，随后自然结束返回最终文本", async () => {
		const { options, workspace } = makeOptions(
			makeMultiRoundClient([
				postTurn("call-w1", "write://out/first.txt", "第一条"),
				postTurn("call-w2", "write://out/second.txt", "第二条"),
				contentTurn("交付完成"),
			]),
		);

		const result = await runHeadless(options);

		expect(result.success).toBe(true);
		expect(result.error).toBeNull();
		expect(result.result).toBe("交付完成");
		expect(readFileSync(join(workspace, "out", "first.txt"), "utf8")).toBe(
			"第一条",
		);
		expect(readFileSync(join(workspace, "out", "second.txt"), "utf8")).toBe(
			"第二条",
		);
	});

	test("工具轮后错误终止：已写入文件保留，success 为 false", async () => {
		const { options, workspace } = makeOptions(
			makeMultiRoundClient([
				postTurn("call-w1", "write://out/kept.txt", "保留内容"),
				errorTurn("stream exploded"),
			]),
		);

		const result = await runHeadless(options);

		expect(result.success).toBe(false);
		expect(result.result).toBeNull();
		expect(result.error).toContain("stream exploded");
		expect(readFileSync(join(workspace, "out", "kept.txt"), "utf8")).toBe(
			"保留内容",
		);
	});
});
