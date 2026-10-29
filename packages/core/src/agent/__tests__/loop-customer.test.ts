// test assertions on known-shape results
/**
 * agentLoop customer:// 终止行为测试。
 *
 * - customer:// 调用中断循环，全部结果按提交顺序返回在 results 中；
 * - 无工具调用的 content-only 轮自然结束（自然结束是终止路径，不再注入 idle nudge）；
 * - 非 customer 调用（write:// 等）不触发终止，customer 结果仍被收集返回。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { makeToolkit } from "@n0n/tools";
import type {
  CustomerCompleted,
  DomainMessage,
  LLMClient,
  StreamEvent,
  ToolResult,
} from "@n0n/types";

import { PlainRenderer } from "../../ui/renderer.ts";
import { agentLoop } from "../loop.ts";

// ── 辅助 ──

/** 按轮次脚本化的 mock client：每次 stream() 调用消费一个轮次的事件 */
function makeScriptedClient(turns: StreamEvent[][]): LLMClient {
  let turn = 0;
  return {
    modelId: "mock",
    async *stream(): AsyncGenerator<StreamEvent> {
      const events = turns[turn] ?? [
        { type: "done", finishReason: "stop", usage: null },
      ];
      turn++;
      yield* events;
    },
    async complete() {
      return { text: "" };
    },
    async ping() {
      return { ok: true };
    },
  };
}

/** 单轮：N 个 customer:// tool call + done */
function customerTurn(kinds: string[]): StreamEvent[] {
  return [
    ...kinds.map((kind, index) => ({
      type: "tool_call_delta" as const,
      index,
      id: `customer-${index + 1}`,
      name: "post",
      arguments: JSON.stringify({
        uri: `customer://${kind}`,
        body: `消息 ${index + 1}`,
      }),
    })),
    { type: "done" as const, finishReason: "tool_calls", usage: null },
  ];
}

function makeToolkitForTest(workspace: string, sessionDir: string) {
  return makeToolkit({
    security: { blocked_commands: [] },
    agent: { default_exec_waitfor: 10, max_exec_output_tokens: 1000 },
    platform: process.platform === "win32" ? "win32" : "linux",
    workspace,
    sessionDir,
  });
}

const history: DomainMessage[] = [
  { type: "generic_user_text", content: "测试 customer 终止" },
];

describe("agentLoop customer:// 终止", () => {
  test("同一轮提交两个 customer:// 时按顺序返回全部结果", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "n0n-loop-cust-"));
    const result = await agentLoop<CustomerCompleted>(history, {
      client: makeScriptedClient([customerTurn(["question", "form"])]),
      toolkit: makeToolkitForTest(workspace, workspace),
      renderer: new PlainRenderer(),
      max_iterations: 3,
    });

    const customerResults = result.history.filter(
      (message): message is ToolResult =>
        message.type === "tool_result" &&
        message.tool === "post" &&
        message.scheme === "customer",
    );
    expect(customerResults).toHaveLength(2);
    expect(result.results).toHaveLength(2);
    expect(result.results.map((r) => r.kind)).toEqual(["question", "form"]);
    expect(result.result).toEqual(result.results[0] ?? null);
  });
});

describe("agentLoop 自然结束", () => {
  test("content-only 轮（无工具调用）自然结束", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "n0n-loop-nat-"));
    const result = await agentLoop<CustomerCompleted>(history, {
      client: makeScriptedClient([
        [
          { type: "content", text: "任务完成，无待确认事项。" },
          { type: "done", finishReason: "stop", usage: null },
        ],
      ]),
      toolkit: makeToolkitForTest(workspace, workspace),
      renderer: new PlainRenderer(),
      max_iterations: 3,
    });

    expect(result.result).toBeNull();
    expect(result.results).toEqual([]);
    expect(result.report).toBeNull();

    // 自然结束的 assistant 文本进入历史，且没有 idle nudge 注入
    const assistantTexts = result.history.filter(
      (m): m is Extract<DomainMessage, { type: "assistant_text" }> =>
        m.type === "assistant_text",
    );
    expect(assistantTexts).toHaveLength(1);
    expect(assistantTexts[0]!.content).toBe("任务完成，无待确认事项。");
    const nudges = result.history.filter(
      (m) => m.type === "generic_user_text" && m !== history[0],
    );
    expect(nudges).toHaveLength(0);
  });
});

describe("agentLoop 混合轮次", () => {
  test("write:// 不触发终止，customer:// 结果仍被返回", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "n0n-loop-mix-"));
    const sessionDir = mkdtempSync(join(tmpdir(), "n0n-loop-mix-sess-"));
    const turn: StreamEvent[] = [
      {
        type: "tool_call_delta",
        index: 0,
        id: "file-1",
        name: "post",
        arguments: JSON.stringify({
          uri: "write://probe.txt",
          body: "written",
        }),
      },
      {
        type: "tool_call_delta",
        index: 1,
        id: "customer-1",
        name: "post",
        arguments: JSON.stringify({
          uri: "customer://question",
          body: "A 还是 B？",
        }),
      },
      { type: "done", finishReason: "tool_calls", usage: null },
    ];

    const result = await agentLoop<CustomerCompleted>(history, {
      client: makeScriptedClient([turn]),
      toolkit: makeToolkitForTest(workspace, sessionDir),
      renderer: new PlainRenderer(),
      max_iterations: 3,
    });

    // customer 结果终止循环并返回；file 结果只进历史
    expect(result.results).toHaveLength(1);
    expect(result.results[0]!.scheme).toBe("customer");
    expect(result.results[0]!.kind).toBe("question");

    const postResults = result.history.filter(
      (message): message is ToolResult =>
        message.type === "tool_result" && message.tool === "post",
    );
    expect(postResults.map((r) => r.scheme).sort()).toEqual([
      "customer",
      "write",
    ]);
  });
});
