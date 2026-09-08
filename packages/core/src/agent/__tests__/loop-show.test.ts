/**
 * agentLoop show 返回行为测试。
 *
 * 模型在同一轮提交多个 show 时，agentLoop 必须按提交顺序返回全部结果，
 * 而不是只返回首个；历史中仍需保留每个 show 的工具结果。
 */

import { describe, expect, test } from "bun:test";
import { makeToolkit } from "@n0n/tools";
import type {
	DomainMessage,
	LLMClient,
	StreamEvent,
	ToolResult,
} from "@n0n/types";
import { PlainRenderer } from "../../ui/renderer.ts";
import { agentLoop } from "../loop.ts";

const showConfig = [
	{
		value: "production record",
		typeDesc: "记录",
		contentDesc: "",
	},
	{
		value: "qualified delivery",
		typeDesc: "交付",
		contentDesc: "",
	},
];

function makeClient(showArgs: { type: string; content: string }[]): LLMClient {
	return {
		modelId: "mock",
		async *stream(): AsyncGenerator<StreamEvent> {
			for (const [index, args] of showArgs.entries()) {
				yield {
					type: "tool_call_delta",
					index,
					id: `show-${index + 1}`,
					name: "show",
					arguments: JSON.stringify(args),
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

function makeToolkitForTest() {
	return makeToolkit(
		showConfig,
		{
			security: { blocked_commands: [] },
			agent: { default_exec_waitfor: 10, max_exec_output_tokens: 1000 },
			platform: process.platform === "win32" ? "win32" : "linux",
			workspace: process.cwd(),
			sessionDir: process.cwd(),
		},
		"mock",
	);
}

const history: DomainMessage[] = [
	{ type: "generic_user_text", content: "测试多 show" },
];

describe("agentLoop 多 show 返回", () => {
	test("同一轮提交两个 show 时按顺序返回全部结果", async () => {
		const first = { type: "production record", content: "第一条" };
		const second = { type: "production record", content: "第二条" };
		const result = await agentLoop(history, {
			client: makeClient([first, second]),
			toolkit: makeToolkitForTest(),
			renderer: new PlainRenderer(),
			max_iterations: 2,
		});

		const showToolResults = result.history.filter(
			(message): message is ToolResult =>
				message.type === "tool_result" && message.tool === "show",
		);
		expect(showToolResults).toHaveLength(2);
		expect(result.result).toEqual(first);
		expect(result.results).toEqual([first, second]);
	});
});
