/**
 * format-prompt snapshot 生成器
 *
 * 为每种 DomainMessage 类型生成独立的 snapshot 文件，
 * 展示 formatPrompt 的格式化结果，供人工检查提示词结构。
 * 工具侧场景统一使用唯一工具 `post`（exec:// write:// customer:// todo://）。
 *
 * 运行: bun run packages/shared/scripts/generate-format-snapshots.ts
 * 输出: packages/shared/scripts/preview-output/<type>.snapshot.md
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { formatPrompt } from "@n0n/format-prompt";
import { createTagAdapter } from "@n0n/shared";
import type { DomainMessage, PromptMessage } from "@n0n/types";

const MODEL = "claude-sonnet-4-20250514";
const SNAPSHOT_DIR = join(import.meta.dir, "preview-output");

mkdirSync(SNAPSHOT_DIR, { recursive: true });

/** 示例工作区（exec 结果的 cwd / write 结果的 path 展示用） */
const WORKSPACE = "/Users/preview/projects/demo";

/** 单个 snapshot 场景 */
interface Scenario {
  /** 文件名（不含扩展名） */
  file: string;
  /** 场景标题 */
  title: string;
  /** 输入的 DomainMessage 列表 */
  messages: DomainMessage[];
}

const scenarios: Scenario[] = [
  // ── system ──
  {
    file: "system",
    title: "system 消息 + 连续合并",
    messages: [
      { type: "system", content: "You are a helpful assistant." },
      { type: "system", content: "Always use tools to make progress." },
    ],
  },

  // ── user ──
  {
    file: "user-text",
    title: "user_text 消息",
    messages: [
      { type: "generic_user_text", content: "Hello, help me fix this bug." },
    ],
  },
  {
    file: "user-input",
    title: "user_input 消息（含 context + hint）",
    messages: [
      {
        type: "user_input",
        content: "Fix the bug in auth module",
        context:
          "<git_branch>main</git_branch>\n<git_status>M src/auth.ts</git_status>",
        hint: "Start by reading src/auth.ts",
        mentionedSkills: [],
      },
    ],
  },
  {
    file: "user-image",
    title: "user_image 消息（降级为文本）",
    messages: [
      {
        type: "user_image",
        text: "What is this error?",
        imagePath: "/tmp/screenshot.png",
        focusX: 0,
        focusY: 0,
        scale: 1,
      },
    ],
  },

  // ── assistant ──
  {
    file: "assistant-text",
    title: "assistant_text 消息（含 reasoning）",
    messages: [
      {
        type: "assistant_text",
        content: "I'll help you fix that bug.",
        reasoning: {
          ok: true,
          value:
            "The user wants me to fix an auth bug. Let me read the file first.",
        },
        reasoningSignature: "sig_abc123",
      },
    ],
  },
  {
    file: "assistant-tool-call",
    title: "assistant_tool_call 消息（post 工具）",
    messages: [
      {
        type: "assistant_tool_call",
        content: "Let me read the file.",
        reasoning: { ok: false },
        reasoningSignature: undefined,
        toolCalls: [
          {
            id: "tc_1",
            tool: "post",
            args: { uri: "exec://sh/read-auth", body: "cat src/auth.ts" },
          },
          {
            id: "tc_2",
            tool: "post",
            args: { uri: "write://test.txt", body: "hi" },
          },
        ],
      },
    ],
  },
  {
    file: "write-window-call",
    title: "assistant_tool_call — write://?prefix_lines 窗口写入（FIM）",
    messages: [
      {
        type: "assistant_tool_call",
        content: "只改窗口中间的行，锚行原样保留。",
        reasoning: { ok: false },
        toolCalls: [
          {
            id: "tc_w",
            tool: "post",
            args: {
              uri: "write://src/config.ts?prefix_lines=2&suffix_lines=2",
              body: [
                'import { z } from "zod";',
                'import type { Config } from "./types";',
                "export const config = z.object({ x: z.string() });",
                "export type Config = z.infer<typeof config>;",
                "export default config;",
              ].join("\n"),
            },
          },
        ],
      },
    ],
  },

  // ── exec tool_result (3 statuses) ──
  {
    file: "exec-completed",
    title: "exec tool_result — status: completed（正常完成）",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "exec",
        claim: "read-auth",
        runtime: "sh",
        cwd: `${WORKSPACE}/src`,
        status: "completed",
        call: {
          id: "tc_1",
          tool: "post",
          args: { uri: "exec://sh/read-auth", body: "echo hello && ls" },
        },
        exitCode: 0,
        stdout: "hello\nindex.ts\nutils.ts",
        stderr: "",
        durationMs: 12,
      },
    ],
  },
  {
    file: "exec-completed-error",
    title: "exec tool_result — status: completed（命令失败）",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "exec",
        claim: "cat-missing",
        runtime: "sh",
        cwd: WORKSPACE,
        status: "completed",
        call: {
          id: "tc_2",
          tool: "post",
          args: { uri: "exec://sh/cat-missing", body: "cat missing.txt" },
        },
        exitCode: 1,
        stdout: "",
        stderr: "cat: missing.txt: No such file or directory",
        durationMs: 5,
      },
    ],
  },
  {
    file: "exec-truncated",
    title: "exec tool_result — status: truncated（输出超长截断）",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "exec",
        claim: "find-ts",
        runtime: "sh",
        cwd: WORKSPACE,
        status: "truncated",
        call: {
          id: "tc_3",
          tool: "post",
          args: { uri: "exec://sh/find-ts", body: "find . -name '*.ts'" },
        },
        exitCode: 0,
        stdoutPreview:
          "./src/exec/executor.ts\n./src/exec/security.ts\n./src/types/domain.ts",
        stderrPreview: "",
        artifact: {
          kind: "execution",
          version: 1,
          runId: "tc_3",
          runDir: ".temp/session-0001/exec/runs/tc_3",
          stdoutFile: ".temp/session-0001/exec/runs/tc_3/stdout.txt",
          stderrFile: ".temp/session-0001/exec/runs/tc_3/stderr.txt",
          resultFile: ".temp/session-0001/exec/runs/tc_3/result.json",
        },
        stdoutLength: 28450,
        stderrLength: 0,
        stdoutLines: 850,
        stderrLines: 0,
        outputTokenBudget: 5_000,
        stdoutEstimatedTokens: 8_200,
        stderrEstimatedTokens: 0,
        totalEstimatedTokens: 8_200,
        durationMs: 320,
      },
    ],
  },
  {
    file: "exec-backgrounded",
    title: "exec tool_result — status: backgrounded（等待超限转后台）",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "exec",
        claim: "npm-install",
        runtime: "sh",
        cwd: WORKSPACE,
        status: "backgrounded",
        call: {
          id: "tc_4",
          tool: "post",
          args: { uri: "exec://sh/npm-install", body: "npm install" },
        },
        pid: 65432,
        artifact: {
          kind: "execution",
          version: 1,
          runId: "tc_4",
          runDir: ".temp/session-0001/exec/runs/tc_4",
          stdoutFile: ".temp/session-0001/exec/runs/tc_4/stdout.txt",
          stderrFile: ".temp/session-0001/exec/runs/tc_4/stderr.txt",
          resultFile: ".temp/session-0001/exec/runs/tc_4/result.json",
        },
        stdoutSoFar:
          "npm warn deprecated inflight@1.0.6\nadded 142 packages in 28s",
        stderrSoFar: "",
        durationMs: 30_003,
      },
    ],
  },

  // ── other tool_results ──
  {
    file: "write-result",
    title: "write tool_result（completed）",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "write",
        path: `${WORKSPACE}/src/config.ts`,
        status: "completed",
        call: {
          id: "tc_5",
          tool: "post",
          args: {
            uri: "write://src/config.ts?prefix_lines=2&suffix_lines=2",
            body: 'import { z } from "zod";\nexport const config = z.object({ x: z.string() });',
          },
        },
      },
    ],
  },
  {
    file: "customer-result",
    title: "customer:// tool_result",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "customer",
        kind: "question",
        slug: "choose-approach",
        status: "completed",
        call: {
          id: "tc_7",
          tool: "post",
          args: {
            uri: "customer://question/choose-approach",
            body: "Task done — continue?",
          },
        },
      },
    ],
  },
  {
    file: "todo-result",
    title: "todo:// tool_result",
    messages: [
      {
        type: "tool_result",
        tool: "post",
        scheme: "todo",
        goal: "fix-auth-bug",
        path: `${WORKSPACE}/.n0n/previews/preview-session/todo/fix-auth-bug.md`,
        status: "completed",
        call: {
          id: "tc_8",
          tool: "post",
          args: { uri: "todo://fix-auth-bug", body: "- [ ] 排查 token 过期" },
        },
      },
    ],
  },

  // ── special messages ──
  {
    file: "tool-arg-error",
    title: "tool_arg_error 消息（含 schema）",
    messages: [
      {
        type: "tool_arg_error",
        callId: "tc_err",
        tool: "post",
        error: {
          kind: "invalid_args",
          issues: [{ path: "uri", message: "Required" }],
          schema: {
            type: "object",
            properties: { uri: { type: "string" }, body: { type: "string" } },
            required: ["uri", "body"],
          },
        },
      },
    ],
  },
];

// ── 生成 ──

function formatResult(r: PromptMessage): string {
  const lines = [`role: ${r.role}`];
  if (r.role === "tool") {
    lines.push(`toolCallId: ${r.toolCallId}`);
    lines.push(`toolName: ${r.toolName}`);
  }
  if (r.role === "assistant" && r.reasoning) {
    lines.push(`reasoning: ${r.reasoning}`);
  }
  if (r.role === "assistant" && r.toolCalls?.length) {
    lines.push(`toolCalls: ${JSON.stringify(r.toolCalls, null, 2)}`);
  }
  lines.push("", "--- content ---", r.content);
  return lines.join("\n");
}

let count = 0;
for (const scenario of scenarios) {
  const results = formatPrompt(scenario.messages, createTagAdapter("default"));
  const parts = [`# ${scenario.title}`, `<!-- model: ${MODEL} -->`, ""];
  for (const r of results) {
    parts.push("```", formatResult(r), "```", "");
  }
  const outPath = join(SNAPSHOT_DIR, `${scenario.file}.snapshot.md`);
  await Bun.write(outPath, parts.join("\n"));
  count++;
}

console.log(`Generated ${count} snapshots in ${SNAPSHOT_DIR}/`);

// ── DeepSeek tag 风格 snapshot ──

const DS_SNAPSHOT_DIR = join(import.meta.dir, "preview-output-deepseek");
mkdirSync(DS_SNAPSHOT_DIR, { recursive: true });

let dsCount = 0;
for (const scenario of scenarios) {
  const results = formatPrompt(scenario.messages, createTagAdapter("deepseek"));
  const parts = [
    `# ${scenario.title}`,
    `<!-- model: deepseek, tag-style: deepseek -->`,
    "",
  ];
  for (const r of results) {
    parts.push("```", formatResult(r), "```", "");
  }
  const outPath = join(DS_SNAPSHOT_DIR, `${scenario.file}.snapshot.md`);
  await Bun.write(outPath, parts.join("\n"));
  dsCount++;
}

console.log(`Generated ${dsCount} deepseek snapshots in ${DS_SNAPSHOT_DIR}/`);
