/**
 * runHeadless — 单 post 工具暴露面、自然结束与错误终止。
 *
 * 无客户后续参与：customer:// 不出现在工具描述中，即使模型发出也以
 * arg-error 拒绝并继续循环；循环以自然结束（纯内容）或错误 report 终止。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { LLMClient, StreamEvent, StreamRequest } from "@n0n/types";
import { runHeadless } from "../headless.ts";

const agentConfig = {
	max_iterations: 5,
	max_idle_rounds: 2,
	default_exec_waitfor: 10,
	max_exec_output_tokens: 32_000,
};

/** 一次 stream() 调用产出的完整事件序列 */
type Turn = StreamEvent[];

function makeClient(
	turns: Turn[],
	onRequest?: (request: StreamRequest) => void,
): LLMClient {
	let index = 0;
	return {
		modelId: "mock-headless",
		async *stream(request): AsyncGenerator<StreamEvent> {
			onRequest?.(request);
			const turn = turns[index++];
			if (!turn) {
				throw new Error("Mock headless client ran out of turns");
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

/** 纯内容轮 → 自然结束 */
function contentTurn(text: string): Turn {
	return [
		{ type: "content", text },
		{ type: "done", finishReason: "stop", usage: null },
	];
}

/** post 工具调用轮 */
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

/** LLM 流错误轮 → 错误 report 终止 */
function errorTurn(message: string): Turn {
	return [
		{ type: "error", error: message },
		{ type: "done", finishReason: "stop", usage: null },
	];
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

describe("runHeadless 单 post 工具与终止方式", () => {
	test("只提供单个 post 工具，描述中不含 customer://", async () => {
		let tools: StreamRequest["tools"];
		const client = makeClient([contentTurn("完成")], (request) => {
			tools = request.tools;
		});

		const result = await runHeadless(makeOptions(client));

		expect(result.success).toBe(true);
		expect(tools).toHaveLength(1);
		const post = tools?.[0];
		expect(post?.name).toBe("post");
		expect(post?.description).not.toContain("customer://");
		expect(Object.keys(post?.parameters.properties ?? {}).sort()).toEqual([
			"body",
			"uri",
		]);
	});

	test("自然结束返回最终文本，success 等价于无错误", async () => {
		const result = await runHeadless(
			makeOptions(makeClient([contentTurn("全部验收通过")])),
		);

		expect(result.success).toBe(true);
		expect(result.error).toBeNull();
		expect(result.report).toBeNull();
		expect(result.result).toBe("全部验收通过");
		expect(result.rounds).toBe(1);
	});

	test("模型发出的 customer:// 被拒绝，循环继续到自然结束", async () => {
		const result = await runHeadless(
			makeOptions(
				makeClient([
					postTurn("call-customer", "customer://question", "选哪个？\n推荐 A"),
					contentTurn("已按现有输入完成"),
				]),
			),
		);

		// customer:// 未终止循环：agentLoop 继续到第二轮自然结束
		expect(result.success).toBe(true);
		expect(result.result).toBe("已按现有输入完成");
	});

	test("LLM 流错误映射为失败 report", async () => {
		const result = await runHeadless(
			makeOptions(makeClient([errorTurn("network boom")])),
		);

		expect(result.success).toBe(false);
		expect(result.result).toBeNull();
		expect(result.error).toContain("network boom");
	});
});
