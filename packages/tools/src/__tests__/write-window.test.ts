/**
 * write scheme 窗口写入（prefix/suffix，FIM 式）测试
 *
 * 覆盖：全写回归、窗口替换/插入/删除、单侧 0（文件头/文件尾）、
 * 零匹配/多匹配报错、body 行数不足、CRLF 容忍、resourceKey 串行、
 * recover 三态（全写截断 / 窗口截断可拼 / 窗口截断不可拼）。
 */

import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolvePlatform } from "@n0n/shared";
import type { ToolArgErrorMessage, ToolCallRecord } from "@n0n/types";

import { makeToolkit, type ToolJob } from "../index.ts";

const SESSION_DIR = mkdtempSync(join(tmpdir(), "n0n-write-win-"));
const WORKSPACE = mkdtempSync(join(tmpdir(), "n0n-write-win-ws-"));

function makeConfig() {
  return {
    security: { blocked_commands: [] },
    agent: { default_exec_waitfor: 10, max_exec_output_tokens: 32_000 },
    platform: resolvePlatform(),
    workspace: WORKSPACE,
    sessionDir: SESSION_DIR,
  };
}

let fileSeq = 0;
function uniqueName(): string {
  return `f${++fileSeq}.txt`;
}

/** 在 workspace 写入测试文件，返回绝对路径 */
function seed(content: string, name = uniqueName()): string {
  const p = join(WORKSPACE, name);
  writeFileSync(p, content, "utf8");
  return p;
}

function read(absPath: string): string {
  return readFileSync(absPath, "utf8");
}

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

/** 执行一次 post 调用，返回 [首事件, 事件列表] */
async function runPost(uri: string, body: string, id = `c-${Date.now()}`) {
  const session = makeToolkit(makeConfig()).bind();
  const events = await collect(session.createJob(postCall(id, uri, body)));
  return { first: events[0], events };
}

/** 执行并断言成功写盘，返回落盘内容 */
async function writeAndRead(uri: string, body: string): Promise<string> {
  const { first } = await runPost(uri, body);
  if (first?.type !== "tool_result") {
    throw new Error(`expected tool_result, got ${JSON.stringify(first)}`);
  }
  if (first.type === "tool_result" && "status" in first) {
    expect(first.status).toBe("completed");
  }
  const rel = uri.slice("write://".length).split("?")[0] as string;
  return read(join(WORKSPACE, decodeURIComponent(rel)));
}

function expectArgError(first: unknown): ToolArgErrorMessage {
  if (!first || typeof first !== "object" || !("type" in first)) {
    throw new Error(`expected tool_arg_error, got ${JSON.stringify(first)}`);
  }
  if (first.type !== "tool_arg_error") {
    throw new Error(`expected tool_arg_error, got ${JSON.stringify(first)}`);
  }
  return first as ToolArgErrorMessage;
}

describe("write — 全写回归", () => {
  it("省略参数：body = 完整文件，直接覆盖", async () => {
    const p = seed("old content\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(`write://${rel}`, "new content\n");
    expect(read(p)).toBe("new content\n");
  });

  it("显式 0/0 等价于全写", async () => {
    const p = seed("old\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=0&suffix_lines=0`,
      "replaced\n",
    );
    expect(read(p)).toBe("replaced\n");
  });
});

describe("write — 窗口替换 / 插入 / 删除", () => {
  it("窗口替换：旧中间替换为新内容，其余保留", async () => {
    const p = seed("head\nold1\nold2\ntail\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "head\nNEW\ntail\n",
    );
    expect(read(p)).toBe("head\nNEW\ntail\n");
  });

  it("插入：prefix 与 suffix 在文件中相邻，旧中间为空", async () => {
    const p = seed("a\nb\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "a\ninserted\nb\n",
    );
    expect(read(p)).toBe("a\ninserted\nb\n");
  });

  it("删除：content 为空（body 恰为 P + S 行）", async () => {
    const p = seed("keep1\ndrop1\ndrop2\nkeep2\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "keep1\nkeep2\n",
    );
    expect(read(p)).toBe("keep1\nkeep2\n");
  });
});

describe("write — 单侧 0", () => {
  it("suffix_lines > 0 & prefix_lines = 0：窗口从文件头开始", async () => {
    const p = seed("oldhead\nbody\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(`write://${rel}?suffix_lines=1`, "newhead\nbody\n");
    expect(read(p)).toBe("newhead\nbody\n");
  });

  it("prefix_lines > 0 & suffix_lines = 0：窗口延伸到文件尾", async () => {
    const p = seed("head\noldtail1\noldtail2\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=1`,
      "head\nnewtail1\nnewtail2\n",
    );
    expect(read(p)).toBe("head\nnewtail1\nnewtail2\n");
  });
});

describe("write — 错误契约", () => {
  it("零匹配：报 tool_arg_error 且消息含磁盘实际内容", async () => {
    const p = seed("actual line one\nactual line two\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const { first } = await runPost(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "nonexistent anchor\nX\nactual line two\n",
    );
    const err = expectArgError(first);
    expect(err.error.kind).toBe("invalid_args");
    if (err.error.kind !== "invalid_args") return;
    expect(err.error.issues[0]?.path).toBe("body");
    const msg = err.error.issues[0]?.message ?? "";
    // 附上磁盘实际内容，让模型一眼看到不匹配原因
    expect(msg).toContain("actual line one");
    // 附修复指引
    expect(msg).toContain("enlarge prefix_lines/suffix_lines");
    // 文件未被修改
    expect(read(p)).toBe("actual line one\nactual line two\n");
  });

  it("零匹配（suffix 未跟在 prefix 后）：消息含该位置实际内容", async () => {
    const p = seed("anchor\nnot-the-suffix\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const { first } = await runPost(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "anchor\nNEW\ndifferent suffix\n",
    );
    const err = expectArgError(first);
    if (err.error.kind !== "invalid_args") throw new Error("bad kind");
    expect(err.error.issues[0]?.message).toContain("not-the-suffix");
  });

  it("多匹配：报错提示扩大窗口消歧", async () => {
    const p = seed("dup\nx\ndup\ny\ndup\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const { first } = await runPost(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "dup\nNEW\ndup\n",
    );
    const err = expectArgError(first);
    if (err.error.kind !== "invalid_args") throw new Error("bad kind");
    expect(err.error.issues[0]?.message).toContain("matches 2 times");
    expect(read(p)).toBe("dup\nx\ndup\ny\ndup\n");
  });

  it("body 行数不足 P + S：报错", async () => {
    const p = seed("a\nb\nc\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const { first } = await runPost(
      `write://${rel}?prefix_lines=2&suffix_lines=2`,
      "a\n", // 1 行 < 4
    );
    const err = expectArgError(first);
    if (err.error.kind !== "invalid_args") throw new Error("bad kind");
    expect(err.error.issues[0]?.message).toContain(
      "prefix_lines + suffix_lines",
    );
  });

  it("窗口写目标文件不存在：报错并指引先全写创建", async () => {
    const rel = uniqueName();
    const { first } = await runPost(`write://${rel}?prefix_lines=1`, "a\n");
    const err = expectArgError(first);
    if (err.error.kind !== "invalid_args") throw new Error("bad kind");
    expect(err.error.issues[0]?.message).toContain("does not exist");
    expect(existsSync(join(WORKSPACE, rel))).toBe(false);
  });
});

describe("write — CRLF 容忍", () => {
  it("CRLF 文件 + LF body：匹配成功，写盘统一 LF", async () => {
    const p = seed("head\r\nold\r\ntail\r\n");
    const rel = p.slice(WORKSPACE.length + 1);
    await writeAndRead(
      `write://${rel}?prefix_lines=1&suffix_lines=1`,
      "head\nNEW\ntail\n",
    );
    expect(read(p)).toBe("head\nNEW\ntail\n");
  });
});

describe("write — resourceKey 串行", () => {
  it("同路径的窗口写与全写串行；不同路径可并行", () => {
    const session = makeToolkit(makeConfig()).bind();
    const windowSelf = postCall(
      "self-win",
      "write://a.txt?prefix_lines=1",
      "head\nx\n",
    );
    const fullSelf = postCall("self-full", "write://a.txt", "x");

    // 窗口写 vs 同路径全写（active）→ 串行
    expect(
      session
        .createJob(windowSelf)
        .canStart([postCall("w1", "write://a.txt", "y")]),
    ).toBe(false);
    // 全写（self）vs 同路径窗口写（active）→ 串行
    expect(
      session
        .createJob(fullSelf)
        .canStart([
          postCall(
            "w2",
            "write://a.txt?prefix_lines=1&suffix_lines=1",
            "y\nz\n",
          ),
        ]),
    ).toBe(false);
    // 不同路径（query 不影响 resourceKey）→ 可并行
    expect(
      session
        .createJob(windowSelf)
        .canStart([postCall("w3", "write://b.txt?suffix_lines=1", "y")]),
    ).toBe(true);
  });
});

describe("write — recover 截断恢复", () => {
  const session = makeToolkit(makeConfig()).bind();

  async function recoverCall(partialInput: string, toolCallId: string) {
    return session.recover({
      index: 0,
      toolCallId,
      toolName: "post",
      partialInput,
    });
  }

  it("全写截断：body 原样写入，标记 recovered", async () => {
    const rel = uniqueName();
    const result = await recoverCall(
      `{"uri":"write://${rel}","body":"partial content`,
      "r-full",
    );
    expect(result.status).toBe("recovered");
    expect(read(join(WORKSPACE, rel))).toBe("partial content");
  });

  it("窗口截断（S=0，prefix 锚定）：截断 content 拼到 EOF，标记 recovered", async () => {
    const p = seed("head\nold1\nold2\n");
    const rel = p.slice(WORKSPACE.length + 1);
    // 截断的 content 只有一半（无换行收尾）→ prefix 匹配后拼入，窗口延伸到 EOF
    const result = await recoverCall(
      `{"uri":"write://${rel}?prefix_lines=1","body":"head\\npartial new`,
      "r-win",
    );
    expect(result.status).toBe("recovered");
    expect(read(p)).toBe("head\npartial new");
  });

  it("窗口截断（body 完整、仅闭合引号被截）：正常窗口拼入，标记 recovered", async () => {
    const p = seed("head\nold\ntail\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const result = await recoverCall(
      `{"uri":"write://${rel}?prefix_lines=1&suffix_lines=1","body":"head\\npartial new\\ntail\\n`,
      "r-win-full",
    );
    expect(result.status).toBe("recovered");
    expect(read(p)).toBe("head\npartial new\ntail\n");
  });

  it("窗口截断（S>0 且 suffix 锚被截掉）：锚段无法识别，判 unrecoverable", async () => {
    const p = seed("head\nold\ntail\n");
    // body ≥ P+S 行，但末 S 行是被截断的 content 而非 suffix 锚——
    // 与 execute 相同的匹配语义下必然失配 → 不落盘
    const rel = p.slice(WORKSPACE.length + 1);
    const result = await recoverCall(
      `{"uri":"write://${rel}?prefix_lines=1&suffix_lines=1","body":"head\\npartial new\\nmore`,
      "r-win-cut",
    );
    expect(result.status).toBe("unrecoverable");
    expect(read(p)).toBe("head\nold\ntail\n");
  });

  it("窗口截断（body < P + S 行）：无法识别锚段，判 unrecoverable", async () => {
    const p = seed("head\nold\ntail\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const result = await recoverCall(
      `{"uri":"write://${rel}?prefix_lines=2&suffix_lines=2","body":"head\\nonly`,
      "r-short",
    );
    expect(result.status).toBe("unrecoverable");
    // 文件未被修改——严禁把窗口截断 body 当完整文件写入
    expect(read(p)).toBe("head\nold\ntail\n");
  });

  it("窗口截断（锚段匹配失败）：判 unrecoverable，文件不动", async () => {
    const p = seed("head\nold\ntail\n");
    const rel = p.slice(WORKSPACE.length + 1);
    const result = await recoverCall(
      `{"uri":"write://${rel}?prefix_lines=1&suffix_lines=1","body":"wrong anchor\\nnew\\ntail`,
      "r-nomatch",
    );
    expect(result.status).toBe("unrecoverable");
    expect(read(p)).toBe("head\nold\ntail\n");
  });
});
