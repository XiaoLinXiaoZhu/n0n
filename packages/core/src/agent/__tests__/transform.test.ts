/**
 * Transform 模块单元测试
 *
 * 验证：
 *   1. buildTransformRequest 通过 formatPrompt 正确构建请求
 *   2. 末尾包含整理指令
 *   3. 多轮 transformed_observation 的视角切换
 */

import { describe, expect, test } from "bun:test";
import { buildTransformRequest } from "../transform.js";
import type { DomainMessage } from "@n0n/types";

const MODEL = "test-model";

describe("buildTransformRequest", () => {
  test("无 transformed_observation 时仍能构建请求", () => {
    const history: DomainMessage[] = [
      { type: "system", content: "You are a helpful assistant." },
      { type: "user_input", content: "Fix the bug.", context: null, hint: null },
    ];
    const req = buildTransformRequest(history, MODEL);
    expect(req).not.toBeNull();
    // 应该包含 system + user + 整理指令
    expect(req!.messages.length).toBe(3);
    expect(req!.messages[0]!.role).toBe("system");
    expect(req!.messages[1]!.role).toBe("user");
    expect(req!.messages[1]!.content).toBe("Fix the bug.");
  });

  test("末尾包含整理指令", () => {
    const history: DomainMessage[] = [
      { type: "system", content: "System." },
      { type: "user_input", content: "Task.", context: null, hint: null },
      { type: "cache_breakpoint" },
    ];
    const req = buildTransformRequest(history, MODEL);
    expect(req).not.toBeNull();
    const lastMsg = req!.messages[req!.messages.length - 1];
    expect(lastMsg!.content).toInclude("<transform>");
    expect(lastMsg!.content).toInclude("state compression");
  });

  test("系统消息正确提取", () => {
    const history: DomainMessage[] = [
      { type: "system", content: "You are Claude." },
      { type: "user_input", content: "Task.", context: null, hint: null },
      { type: "cache_breakpoint" },
    ];
    const req = buildTransformRequest(history, MODEL);
    expect(req).not.toBeNull();
    expect(req!.messages[0]!.role).toBe("system");
    expect(req!.messages[0]!.content).toBe("You are Claude.");
  });

  test("多轮 transformed_observation — 视角切换后只保留状态消息", () => {
    // 模拟两轮后的历史
    const history: DomainMessage[] = [
      { type: "system", content: "System." },
      { type: "user_input", content: "Task: fix port bug.", context: null, hint: null },
      { type: "cache_breakpoint" },
      // 第 1 轮探索（应被视角切换剔除）
      {
        type: "assistant_tool_call",
        content: "Let me check.",
        reasoning: null,
        reasoningSignature: null,
        toolCalls: [{ id: "c1", tool: "exec", args: { script: "lsof -i :8080", runtime: "cmd" } }],
      },
      {
        type: "tool_result",
        tool: "exec",
        status: "completed",
        exitCode: 0,
        durationMs: 100,
        stdout: "RAW_OUTPUT_XYZ",
        stderr: "",
        call: { id: "c1", tool: "exec", args: { script: "lsof -i :8080", runtime: "cmd" } },
      },
      // 第 1 轮 Transform 产出
      { type: "transformed_observation", content: "Port 8080 occupied by PID 12847." },
      { type: "cache_breakpoint" },
      // 第 2 轮探索（在当前 transformed_observation 之后，应保留）
      {
        type: "assistant_tool_call",
        content: "Killing process.",
        reasoning: null,
        reasoningSignature: null,
        toolCalls: [{ id: "c2", tool: "exec", args: { script: "kill 12847", runtime: "cmd" } }],
      },
      {
        type: "tool_result",
        tool: "exec",
        status: "completed",
        exitCode: 0,
        durationMs: 50,
        stdout: "",
        stderr: "",
        call: { id: "c2", tool: "exec", args: { script: "kill 12847", runtime: "cmd" } },
      },
    ];

    const req = buildTransformRequest(history, MODEL);
    expect(req).not.toBeNull();

    const allContent = req!.messages.map(m => m.content).join(" | ");

    // 第 1 轮探索已被视角切换剔除 → 不应出现 "Let me check" 和 "RAW_OUTPUT_XYZ"
    expect(allContent).not.toInclude("Let me check");
    expect(allContent).not.toInclude("RAW_OUTPUT_XYZ");

    // 状态消息应保留
    expect(allContent).toInclude("Task: fix port bug");
    expect(allContent).toInclude("Port 8080 occupied by PID 12847");

    // 第 2 轮探索应保留（在最后一个 transformed_observation 之后）
    expect(allContent).toInclude("Killing process");
  });

  test("无 cache_breakpoint — 返回有效请求", () => {
    const history: DomainMessage[] = [
      { type: "system", content: "System." },
      { type: "user_input", content: "Task.", context: null, hint: null },
      { type: "assistant_tool_call", content: "Working.", reasoning: null, reasoningSignature: null, toolCalls: [] },
    ];
    const req = buildTransformRequest(history, MODEL);
    expect(req).not.toBeNull();
    // 无 transformed_observation → 视角切换不生效 → 所有消息都保留
    const allContent = req!.messages.map(m => m.content).join(" | ");
    expect(allContent).toInclude("Working");
  });
});
