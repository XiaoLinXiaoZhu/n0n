/**
 * Code REPL 端到端：多轮 post 工具执行 → customer 请求渲染等待 / 自然结束。
 *
 * 第 1 轮 write:// 落盘（agentLoop 内部继续），第 2 轮 customer://question
 * 终止循环并渲染给客户；exitAfterInitialInput 下随后退出。
 * 纯内容轮自然结束时不打印异常终止。
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveBasePaths } from "@n0n/shared";
import type { ToolsConfig } from "@n0n/tools";
import type { LLMClient, StreamEvent } from "@n0n/types";
import { startCodeRepl } from "../repl/index.ts";

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

function makeClient(rounds: Turn[]): LLMClient {
	let roundIndex = 0;
	return {
		modelId: "mock-repl-multi",
		async *stream(): AsyncGenerator<StreamEvent> {
			const turn = rounds[roundIndex++];
			if (!turn) {
				throw new Error("Mock REPL client ran out of rounds");
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

// ── stderr 捕获（cli-ui 的 writeln 直写 process.stderr） ──
const origWrite = process.stderr.write;
let stderrBuf = "";

beforeEach(() => {
	stderrBuf = "";
	process.stderr.write = ((chunk: unknown) => {
		stderrBuf += String(chunk);
		return true;
	}) as typeof process.stderr.write;
});

afterEach(() => {
	process.stderr.write = origWrite;
});

function makePaths() {
	const workspace = mkdtempSync(join(tmpdir(), "n0n-repl-multi-ws-"));
	const sessionDir = mkdtempSync(join(tmpdir(), "n0n-repl-multi-session-"));
	const toolsConfig: ToolsConfig = {
		security: { blocked_commands: [] },
		agent: { default_exec_waitfor: 10, max_exec_output_tokens: 32_000 },
		platform: process.platform === "win32" ? "win32" : "linux",
		workspace,
		sessionDir,
	};
	return { workspace, sessionDir, toolsConfig };
}

describe("startCodeRepl 多轮 post", () => {
	test("write:// 落盘后 customer://question 渲染并等待客户", async () => {
		const { workspace, toolsConfig } = makePaths();
		const client = makeClient([
			postTurn("call-w1", "write://out/report.txt", "阶段结论"),
			postTurn("call-q1", "customer://question", "选哪个？\n推荐 A"),
		]);

		// exitAfterInitialInput:false 才提供 customer://（allowCustomer 跟随该模式）；
		// 渲染后 prompt 在非 TTY 下读到 EOF 返回 null，REPL 随之退出。
		await startCodeRepl(resolveBasePaths(workspace), {
			initialInput: "测试多轮 post",
			exitAfterInitialInput: false,
			client,
			toolsConfig,
			agentConfig: {
				max_iterations: 5,
				max_idle_rounds: 2,
				default_exec_waitfor: 10,
				max_exec_output_tokens: 32_000,
			},
			sessionDir: toolsConfig.sessionDir,
			notifyConfig: { enabled: false },
		});

		expect(readFileSync(join(workspace, "out", "report.txt"), "utf8")).toBe(
			"阶段结论",
		);
		expect(stderrBuf).toContain("问题：");
		expect(stderrBuf).toContain("选哪个？");
		expect(stderrBuf).not.toContain("Agent 异常终止");
	}, 30_000);

	test("纯内容轮自然结束，不打印异常终止", async () => {
		const { workspace, toolsConfig } = makePaths();
		const client = makeClient([contentTurn("任务完成，交付如下……")]);

		await startCodeRepl(resolveBasePaths(workspace), {
			initialInput: "测试自然结束",
			exitAfterInitialInput: true,
			client,
			toolsConfig,
			agentConfig: {
				max_iterations: 5,
				max_idle_rounds: 2,
				default_exec_waitfor: 10,
				max_exec_output_tokens: 32_000,
			},
			sessionDir: toolsConfig.sessionDir,
			notifyConfig: { enabled: false },
		});

		expect(stderrBuf).not.toContain("Agent 异常终止");
		expect(stderrBuf).toContain("Bye!");
	}, 30_000);
});
