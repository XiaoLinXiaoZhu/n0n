import { describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolArgErrorMessage, ToolCallRecord } from "@n0n/types";
import { makeToolkit, type ToolJob } from "../index.ts";

const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-toolkit-"));

const config = {
	security: { blocked_commands: [] },
	agent: { default_exec_waitfor: 10, max_exec_output_tokens: 32_000 },
	platform: "darwin" as const,
	workspace: process.cwd(),
	sessionDir: SESSION_DIR,
};

const showConfig = [
	{
		value: "production record",
		typeDesc: "continue",
		contentDesc: "record",
	},
];

function collect(job: ToolJob) {
	return (async () => {
		const events = [];
		for await (const event of job.run()) events.push(event);
		return events;
	})();
}

describe("Toolkit session", () => {
	it("未知工具 job 产生 unknown_tool", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const job = session.createJob({
			id: "call_unknown",
			tool: "read",
			args: {},
		} as unknown as ToolCallRecord);

		const events = await collect(job);
		const error = events[0] as ToolArgErrorMessage;
		expect(error.callId).toBe("call_unknown");
		expect(error.tool).toBe("read");
		expect(error.error.kind).toBe("unknown_tool");
		expect(error.error).not.toHaveProperty("message");
	});

	it("无效参数由 session 转换为 invalid_args", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const job = session.createJob({
			id: "call_invalid",
			tool: "observe",
			args: {},
		} as unknown as ToolCallRecord);

		const events = await collect(job);
		const error = events[0] as ToolArgErrorMessage;
		expect(error.error.kind).toBe("invalid_args");
	});

	it("output_tokens 超过配置上限时返回 invalid_args", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const job = session.createJob({
			id: "call_output_budget",
			tool: "observe",
			args: { script: "echo hello", output_tokens: 32_001 },
		} as ToolCallRecord);

		const events = await collect(job);
		const error = events[0] as ToolArgErrorMessage;
		expect(error.error.kind).toBe("invalid_args");
		if (error.error.kind === "invalid_args") {
			expect(error.error.issues[0]?.path).toBe("output_tokens");
		}
	});

	it("非流式 show 以单个结果事件执行", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const job = session.createJob({
			id: "call_show",
			tool: "show",
			args: { type: "production record", content: "done" },
		} as ToolCallRecord);

		const events = await collect(job);
		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("tool_result");
	});

	it("show 拒绝配置之外的 type", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const job = session.createJob({
			id: "show-invalid-type",
			tool: "show",
			args: { type: "working log", content: "done" },
		});
		const events = [];
		for await (const event of job.run()) events.push(event);

		expect(events).toHaveLength(1);
		expect(events[0]?.type).toBe("tool_arg_error");
		if (events[0]?.type === "tool_arg_error") {
			expect(events[0].error.kind).toBe("invalid_args");
		}
	});

	it("未知工具恢复为 unknown_tool", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const result = await session.recover({
			index: 0,
			toolCallId: "call_unknown",
			toolName: "read",
			partialInput: "{}",
		});

		expect(result.status).toBe("unrecoverable");
		expect((result.result as ToolArgErrorMessage).error.kind).toBe(
			"unknown_tool",
		);
	});

	it("已知但无恢复器的工具恢复为 truncated_recovery", async () => {
		const session = makeToolkit(showConfig, config).bind();
		const result = await session.recover({
			index: 0,
			toolCallId: "call_observe",
			toolName: "observe",
			partialInput: '{"script":"ec',
		});

		expect(result.status).toBe("unrecoverable");
		expect((result.result as ToolArgErrorMessage).error.kind).toBe(
			"truncated_recovery",
		);
	});
});
