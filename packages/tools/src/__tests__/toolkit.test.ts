import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolvePlatform } from "@n0n/shared";
import type { ToolArgErrorMessage, ToolCallRecord } from "@n0n/types";

import { makeToolkit, type ToolJob } from "../index.ts";

const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-toolkit-"));
const WORKSPACE = mkdtempSync(join(tmpdir(), "n0n-toolkit-ws-"));

function makeConfig(overrides?: { allowCustomer?: boolean }) {
  return {
    security: { blocked_commands: [] },
    agent: { default_exec_waitfor: 10, max_exec_output_tokens: 32_000 },
    platform: resolvePlatform(),
    workspace: WORKSPACE,
    sessionDir: SESSION_DIR,
    ...overrides,
  };
}

const DEFAULT_RUNTIME = resolvePlatform() === "win32" ? "cmd" : "sh";

function postCall(id: string, uri: string, body: string): ToolCallRecord {
  return { id, tool: "post", args: { uri, body } };
}

function collect(job: ToolJob) {
  return (async () => {
    const events = [];
    for await (const event of job.run()) events.push(event);
    return events;
  })();
}

describe("post 单工具注册表", () => {
  it("只暴露一个 post 工具，参数为 uri + body", () => {
    const toolkit = makeToolkit(makeConfig());
    expect(toolkit.tools).toHaveLength(1);
    expect(toolkit.tools[0]?.name).toBe("post");
  });
});

describe("post — exec scheme", () => {
  it("exec:// 运行脚本并返回 scheme: exec 结果", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall("c-exec", `exec://${DEFAULT_RUNTIME}/probe`, "echo hello"),
    );

    const events = await collect(job);
    const result = events.find((e) => e.type === "tool_result");
    expect(result).toBeDefined();
    if (result?.type !== "tool_result") throw new Error("no result");
    expect(result.tool).toBe("post");
    expect("scheme" in result ? result.scheme : undefined).toBe("exec");
    if ("scheme" in result && result.scheme === "exec") {
      expect(result.claim).toBe("probe");
      expect(result.status).toBe("completed");
      if (result.status === "completed") {
        expect(result.exitCode).toBe(0);
        expect(result.stdout.trim()).toBe("hello");
      }
    }
  });
});

describe("post — write scheme", () => {
  it("write:// 写入完整文件内容", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall("c-file", "write://probe.txt", "written"),
    );

    const events = await collect(job);
    const result = events.find((e) => e.type === "tool_result");
    if (result?.type !== "tool_result") throw new Error("no result");
    expect(result.tool).toBe("post");
    if ("scheme" in result && result.scheme === "write") {
      expect(result.status).toBe("completed");
      expect(result.path).toBe(join(WORKSPACE, "probe.txt"));
    }
    expect(existsSync(join(WORKSPACE, "probe.txt"))).toBe(true);
    expect(readFileSync(join(WORKSPACE, "probe.txt"), "utf8")).toBe("written");
  });
});

describe("post — customer scheme", () => {
  it("customer://question 返回 CustomerCompleted", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall("c-cust-q", "customer://question", "A or B?\n推荐 A"),
    );

    const events = await collect(job);
    expect(events).toHaveLength(1);
    const result = events[0];
    if (result?.type !== "tool_result") throw new Error("no result");
    expect(result.tool).toBe("post");
    if ("scheme" in result && result.scheme === "customer") {
      expect(result.status).toBe("completed");
      expect(result.kind).toBe("question");
    }
  });

  it("customer://form 与 customer://action_required", async () => {
    const session = makeToolkit(makeConfig()).bind();
    for (const kind of ["form", "action_required"] as const) {
      const job = session.createJob(
        postCall(`c-cust-${kind}`, `customer://${kind}`, "msg"),
      );
      const events = await collect(job);
      const result = events[0];
      if (result?.type !== "tool_result") throw new Error("no result");
      if ("scheme" in result && result.scheme === "customer") {
        expect(result.kind).toBe(kind);
      }
    }
  });

  it("customer://<kind>/<slug> 产出 slug 字段", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall("c-cust-slug", "customer://question/choose-approach", "msg"),
    );
    const events = await collect(job);
    const result = events[0];
    if (result?.type !== "tool_result") throw new Error("no result");
    if (result.scheme !== "customer") throw new Error("not customer");
    expect(result.slug).toBe("choose-approach");
  });

  it("allowCustomer: false 时 customer:// 以 arg-error 拒绝", async () => {
    const session = makeToolkit(makeConfig({ allowCustomer: false })).bind();
    const job = session.createJob(
      postCall("c-cust-off", "customer://question", "msg"),
    );

    const events = await collect(job);
    const error = events[0] as ToolArgErrorMessage;
    expect(error.type).toBe("tool_arg_error");
    if (error.type === "tool_arg_error") {
      expect(error.error.kind).toBe("invalid_args");
    }
  });
});

describe("post — todo scheme", () => {
  it("todo:// 写入 session todo store 并返回 goal/path", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall(
        "c-todo",
        "todo://refactor-auth",
        "- [ ] step one\n  - [ ] nested",
      ),
    );

    const events = await collect(job);
    const result = events.find((e) => e.type === "tool_result");
    if (result?.type !== "tool_result") throw new Error("no result");
    expect(result.tool).toBe("post");
    if ("scheme" in result && result.scheme === "todo") {
      expect(result.status).toBe("completed");
      expect(result.goal).toBe("refactor-auth");
      expect(result.path).toBe(join(SESSION_DIR, "todo", "refactor-auth.md"));
    }
    expect(
      readFileSync(join(SESSION_DIR, "todo", "refactor-auth.md"), "utf8"),
    ).toBe("- [ ] step one\n  - [ ] nested");
  });

  it("同 goal 覆盖写入（整体替换）", async () => {
    const session = makeToolkit(makeConfig()).bind();
    await collect(
      session.createJob(postCall("c-todo-1", "todo://plan", "- [ ] v1")),
    );
    await collect(
      session.createJob(postCall("c-todo-2", "todo://plan", "- [x] v2")),
    );
    expect(readFileSync(join(SESSION_DIR, "todo", "plan.md"), "utf8")).toBe(
      "- [x] v2",
    );
  });

  it("goal 含路径分隔符时以 invalid_args 拒绝（防路径穿越）", async () => {
    const session = makeToolkit(makeConfig()).bind();
    for (const goal of ["../evil", "a/b", "a\\b", ""]) {
      const job = session.createJob(
        postCall(`c-todo-bad-${goal || "empty"}`, `todo://${goal}`, "body"),
      );
      const events = await collect(job);
      const error = events[0] as ToolArgErrorMessage;
      expect(error.type).toBe("tool_arg_error");
      if (error.type === "tool_arg_error") {
        expect(error.error.kind).toBe("invalid_args");
      }
    }
  });

  it("todo:// 部分参数可恢复（截断 body 仍落盘，标记 recovered）", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const result = await session.recover({
      index: 0,
      toolCallId: "c-todo-recover",
      toolName: "post",
      partialInput: '{"uri":"todo://recovered-plan","body":"- [ ] partial',
    });

    expect(result.status).toBe("recovered");
    expect(
      readFileSync(join(SESSION_DIR, "todo", "recovered-plan.md"), "utf8"),
    ).toBe("- [ ] partial");
  });
});

describe("post — 参数与 uri 错误", () => {
  it("缺少 uri/body 由 session 转换为 invalid_args", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob({
      id: "c-invalid",
      tool: "post",
      args: {},
    } as unknown as ToolCallRecord);

    const events = await collect(job);
    const error = events[0] as ToolArgErrorMessage;
    expect(error.error.kind).toBe("invalid_args");
  });

  it("畸形 uri 转为 invalid_args，path 指向 uri", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const job = session.createJob(
      postCall("c-bad-uri", "http://example.com", "body"),
    );

    const events = await collect(job);
    const error = events[0] as ToolArgErrorMessage;
    expect(error.error.kind).toBe("invalid_args");
    if (error.error.kind === "invalid_args") {
      expect(error.error.issues[0]?.path).toBe("uri");
    }
  });
});

describe("post — canStart 并行准入（按 scheme/path）", () => {
  const session = makeToolkit(makeConfig()).bind();
  const execSelf = postCall("self-exec", "exec://sh/a", "echo 1");
  const fileSelf = postCall("self-file", "write://a.txt", "x");
  const customerSelf = postCall("self-cust", "customer://question", "q");

  it("空 active set 允许并行", () => {
    expect(session.createJob(execSelf).canStart([])).toBe(true);
  });

  it("exec 可与 exec 并行", () => {
    const active = [postCall("a1", "exec://sh/b", "echo 2")];
    expect(session.createJob(execSelf).canStart(active)).toBe(true);
  });

  it("exec 可与 file 并行", () => {
    const active = [postCall("a2", "write://b.txt", "y")];
    expect(session.createJob(execSelf).canStart(active)).toBe(true);
  });

  it("file 可与 exec 并行", () => {
    const active = [postCall("a3", "exec://sh/c", "echo 3")];
    expect(session.createJob(fileSelf).canStart(active)).toBe(true);
  });

  it("同 path 的 file 串行", () => {
    const active = [postCall("a4", "write://a.txt", "z")];
    expect(session.createJob(fileSelf).canStart(active)).toBe(false);
  });

  it("不同 path 的 file 可并行", () => {
    const active = [postCall("a5", "write://other.txt", "z")];
    expect(session.createJob(fileSelf).canStart(active)).toBe(true);
  });

  it("customer 总是独占 — 作为 self 或 active 均阻塞", () => {
    const active = [postCall("a6", "exec://sh/d", "echo 4")];
    expect(session.createJob(customerSelf).canStart(active)).toBe(false);
    expect(session.createJob(execSelf).canStart([customerSelf])).toBe(false);
  });

  it("同 goal 的 todo 串行，不同 goal 可并行", () => {
    const todoSelf = postCall("self-todo", "todo://plan", "- [ ] x");
    expect(
      session
        .createJob(todoSelf)
        .canStart([postCall("a7", "todo://plan", "y")]),
    ).toBe(false);
    expect(
      session
        .createJob(todoSelf)
        .canStart([postCall("a8", "todo://other", "y")]),
    ).toBe(true);
  });

  it("todo 可与 exec/write 并行（无共享资源）", () => {
    const todoSelf = postCall("self-todo2", "todo://plan", "- [ ] x");
    expect(
      session
        .createJob(todoSelf)
        .canStart([postCall("a9", "exec://sh/e", "echo 5")]),
    ).toBe(true);
    expect(
      session
        .createJob(todoSelf)
        .canStart([postCall("a10", "write://b.txt", "y")]),
    ).toBe(true);
  });

  it("write 与 todo 同名不互斥（resourceKey 按 scheme 命名空间）", () => {
    const fileSelf = postCall("self-file2", "write://plan", "x");
    expect(
      session
        .createJob(fileSelf)
        .canStart([postCall("a11", "todo://plan", "y")]),
    ).toBe(true);
  });
});

describe("post — recover 截断恢复", () => {
  it("未知工具恢复为 unknown_tool", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const result = await session.recover({
      index: 0,
      toolCallId: "c-unknown",
      toolName: "read",
      partialInput: "{}",
    });

    expect(result.status).toBe("unrecoverable");
    expect((result.result as ToolArgErrorMessage).error.kind).toBe(
      "unknown_tool",
    );
  });

  it("write:// 部分参数可恢复", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const result = await session.recover({
      index: 0,
      toolCallId: "c-recover-file",
      toolName: "post",
      partialInput: '{"uri":"write://recovered.txt","body":"partial content',
    });

    expect(result.status).toBe("recovered");
  });

  it("exec:// 部分参数不可恢复，返回 truncated_recovery", async () => {
    const session = makeToolkit(makeConfig()).bind();
    const result = await session.recover({
      index: 0,
      toolCallId: "c-recover-exec",
      toolName: "post",
      partialInput: '{"uri":"exec://sh/x","body":"echo ',
    });

    expect(result.status).toBe("unrecoverable");
    expect((result.result as ToolArgErrorMessage).error.kind).toBe(
      "truncated_recovery",
    );
  });
});
