/**
 * preview-deepseek-test-1.ts — 模拟 deepseek-test-1 请求并导出消息组织结构
 *
 * 走与 DeepSeekTest1Client.stream() 完全一致的代码路径：
 *   DomainMessage[] → splitSkillsToUser() → formatPrompt() → toApiMessages()
 *
 * 输出为可读的 markdown 文件，展示最终发送给 DeepSeek API 的消息结构。
 *
 * 用法：
 *   bun run scripts/preview-deepseek-test-1.ts
 *   输出: scripts/preview-deepseek-test-1.md
 */

import { resolve } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
  createTagAdapter,
  formatPrompt,
} from "@n0n/shared";
import { loadInitSkills, toSkill } from "@n0n/skill";
import type { DomainMessage, PromptMessage, ToolCallPart, TagAdapter } from "@n0n/types";
import { splitSkillsToUser } from "../packages/llm/src/deepseek-test-1-client";
import { getPrompt } from "../apps/code/src/prompts";

// ── 输出路径 ──

const workspace = process.cwd();
const outPath = resolve(workspace, "scripts/preview-deepseek-test-1.md");

// ── 初始化：加载系统提示词 + init skills ──

const baseSystemPrompt = getPrompt();
const initSkills = await loadInitSkills();

const systemMessage: DomainMessage = {
  type: "system_with_skill",
  content: baseSystemPrompt,
  skills: initSkills.map(toSkill),
};

// 模拟用户输入
const userMessage: DomainMessage = {
  type: "user_input",
  content: "帮我阅读当前项目的 README，然后总结项目的核心功能。",
  context: null,
  hint: null,
  mentionedSkills: [],
};

// ── 消息历史（与 build-request.ts 一致）──

const history: DomainMessage[] = [
  systemMessage,
  { type: "cache_breakpoint" } as DomainMessage,
  userMessage,
];

// ── deepseek-test-1 管道 ──

const tags: TagAdapter = createTagAdapter("deepseek");
// Step 1: splitSkillsToUser — 把 system_with_skill 拆为 system + user
const preprocessed = splitSkillsToUser(history, tags);

// Step 2: formatPrompt — DomainMessage[] → PromptMessage[]
const promptMessages = formatPrompt(preprocessed, tags);

// Step 3: toApiMessages — PromptMessage[] → API DSMessage[]
interface DSMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function toApiMessages(
  msgs: PromptMessage[],
  enableThinking?: boolean,
): DSMessage[] {
  const result: DSMessage[] = [];
  for (const msg of msgs) {
    switch (msg.role) {
      case "system":
        result.push({ role: "system", content: msg.content });
        break;
      case "user":
        result.push({ role: "user", content: msg.content });
        break;
      case "assistant": {
        const base: DSMessage = {
          role: "assistant",
          content: msg.content || null,
          ...(enableThinking ? { reasoning_content: msg.reasoning ?? "" } : {}),
        };
        if (msg.toolCalls?.length) {
          base.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
          }));
        }
        result.push(base);
        break;
      }
      case "tool":
        result.push({
          role: "tool",
          content: msg.content,
          tool_call_id: msg.toolCallId,
        });
        break;
    }
  }
  return result;
}

const apiMessages = toApiMessages(promptMessages);

// ── 统计 ──

function countChars(messages: DSMessage[]): {
  system: number;
  user: number;
  total: number;
} {
  let system = 0;
  let user = 0;
  for (const msg of messages) {
    const chars = (msg.content ?? "").length;
    if (msg.role === "system") system += chars;
    if (msg.role === "user") user += chars;
  }
  return { system, user, total: system + user };
}

const stats = countChars(apiMessages);

// ── 渲染 Markdown ──

const sections: string[] = [];

sections.push("# deepseek-test-1 — 消息组织预览");
sections.push("");
sections.push(
  "> 模拟 `DeepSeekTest1Client.stream()` 的完整管道：",
  "> `DomainMessage[] → splitSkillsToUser() → formatPrompt() → toApiMessages()`",
);
sections.push(
  "> 重新生成: `bun run scripts/preview-deepseek-test-1.ts`",
);
sections.push("");

// 管道概览
sections.push("## 管道概览");
sections.push("");
sections.push("| 步骤 | 输入 | 输出 |");
sections.push("|------|------|------|");
sections.push(
  `| 1. splitSkillsToUser | ${history.length} DomainMessage (含 system_with_skill) | ${preprocessed.length} DomainMessage (system_with_skill → system + generic_user_text) |`,
);
sections.push(
  `| 2. formatPrompt | ${preprocessed.length} DomainMessage | ${promptMessages.length} PromptMessage |`,
);
sections.push(
  `| 3. toApiMessages | ${promptMessages.length} PromptMessage | ${apiMessages.length} API Message |`,
);
sections.push("");

// Token 统计
sections.push("## Token 统计（approx）");
sections.push("");
sections.push("| 指标 | 值 |");
sections.push("|------|-----|");
sections.push(`| API Messages 总数 | ${apiMessages.length} |`);
sections.push(`| 系统消息字符数 | ${stats.system.toLocaleString()} chars (~${Math.round(stats.system / 4).toLocaleString()} tokens) |`);
sections.push(`| 用户消息字符数 | ${stats.user.toLocaleString()} chars (~${Math.round(stats.user / 4).toLocaleString()} tokens) |`);
sections.push(`| 总字符数 | ${stats.total.toLocaleString()} chars (~${Math.round(stats.total / 4).toLocaleString()} tokens) |`);
sections.push("");

// Init skills
sections.push("## Init Skills 清单");
sections.push("");
sections.push("| Order | Name |");
sections.push("|-------|------|");
for (const s of initSkills) {
  sections.push(`| ${s.order} | ${s.name} |`);
}
sections.push("");

// 消息结构展开
sections.push("---");
sections.push("");
sections.push("## 完整消息序列");
sections.push("");

for (let i = 0; i < apiMessages.length; i++) {
  const msg = apiMessages[i]!;
  const content = msg.content ?? "";
  const chars = content.length;
  const estimatedTokens = Math.round(chars / 4);

  sections.push(
    `### [${i + 1}/${apiMessages.length}] role: \`${msg.role}\` (${chars.toLocaleString()} chars, ~${estimatedTokens.toLocaleString()} tokens)`,
  );
  sections.push("");

  if (msg.role === "tool") {
    sections.push(`> tool_call_id: \`${msg.tool_call_id}\``);
    sections.push("");
  }

  // 内容截断展示：完整输出但太长的用折叠标记
  const MAX_PREVIEW = 8000;
  if (content.length > MAX_PREVIEW) {
    sections.push(
      `<details><summary>展开完整内容 (${content.length.toLocaleString()} chars)</summary>`,
    );
    sections.push("");
    const fence = content.includes("```") ? "~~~~" : "```";
    sections.push(fence);
    sections.push(content);
    sections.push(fence);
    sections.push("");
    sections.push("</details>");
  } else {
    const fence = content.includes("```") ? "~~~~" : "```";
    sections.push(fence);
    sections.push(content);
    sections.push(fence);
  }

  sections.push("");
}

// ── 对比：regular deepseek pipeline ──

// 模拟 regular deepseek 的 formatPrompt 结果（不做 splitSkillsToUser）
const regularPromptMessages = formatPrompt(history, tags);

// regular deepseek: system 消息合并
const regularSystemParts: string[] = [];
for (const msg of regularPromptMessages) {
  if (msg.role === "system") {
    regularSystemParts.push(msg.content);
  }
}
const regularSystemChars = regularSystemParts.reduce((s, p) => s + p.length, 0);

const regularUserParts: string[] = [];
for (const msg of regularPromptMessages) {
  if (msg.role === "user") {
    regularUserParts.push(msg.content);
  }
}
const regularUserChars = regularUserParts.reduce((s, p) => s + p.length, 0);

sections.push("---");
sections.push("");
sections.push("## 与 regular deepseek 对比");
sections.push("");
sections.push("| 维度 | deepseek-test-1 | regular deepseek |");
sections.push("|------|----------------|------------------|");
sections.push(`| Skills 位置 | 第一条 user 消息 | 系统消息末尾 |`);
sections.push(`| 系统消息大小 | ${stats.system.toLocaleString()} chars (~${Math.round(stats.system / 4).toLocaleString()} tokens) | ${regularSystemChars.toLocaleString()} chars (~${Math.round(regularSystemChars / 4).toLocaleString()} tokens) |`);
sections.push(`| 第一条 user 消息大小 | ${stats.user.toLocaleString()} chars (~${Math.round(stats.user / 4).toLocaleString()} tokens) | ${regularUserChars.toLocaleString()} chars (~${Math.round(regularUserChars / 4).toLocaleString()} tokens) |`);
sections.push(`| 工具定义 | 仅 API tools 参数 | DSML 格式前置到系统消息 + API tools 参数 |`);
sections.push(`| 系统消息内容 | 纯文本系统提示词 | 工具定义(DSML) + 系统提示词 + skills |`);
sections.push("");

// ── 写入文件 ──

const outDir = resolve(outPath, "..");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, sections.join("\n"), "utf-8");

// ── 终端摘要 ──

console.log(`Preview written to: ${outPath}`);
console.log("");
console.log("deepseek-test-1 message structure:");
console.log(`  API Messages: ${apiMessages.length}`);
console.log(`  System: ${stats.system.toLocaleString()} chars (~${Math.round(stats.system / 4).toLocaleString()} tokens)`);
console.log(`  User:   ${stats.user.toLocaleString()} chars (~${Math.round(stats.user / 4).toLocaleString()} tokens)`);
console.log(`  Total:  ${stats.total.toLocaleString()} chars (~${Math.round(stats.total / 4).toLocaleString()} tokens)`);
console.log("");
console.log("Regular deepseek (for comparison):");
console.log(`  System: ${regularSystemChars.toLocaleString()} chars (~${Math.round(regularSystemChars / 4).toLocaleString()} tokens)`);
console.log(`  User:   ${regularUserChars.toLocaleString()} chars (~${Math.round(regularUserChars / 4).toLocaleString()} tokens)`);

// ── 额外输出：消息角色序列 ──
console.log("");
console.log("deepseek-test-1 role sequence:");
for (const msg of apiMessages) {
  const preview = (msg.content ?? "").slice(0, 80).replace(/\n/g, "\\n");
  console.log(`  [${msg.role}] ${preview}...`);
}
