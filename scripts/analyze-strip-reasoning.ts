import { readFileSync } from "node:fs";
import { createTagAdapter, formatPrompt } from "@n0n/shared";
import {
  splitSkillsToUser,
  stripReasoningFromPromptMessages,
} from "../packages/llm/src/deepseek-test-1-client/index.ts";
import type { PromptMessage } from "@n0n/types";

// toApiMessages 内联（与 index.ts 中一致）
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

// ============================================================
const raw = readFileSync("n0n-conversation-20260605-124433.json", "utf-8");
const log = JSON.parse(raw);
const history = log.history;

const tags = createTagAdapter("deepseek");

// ============================================================
//  完整 stream 方法管道模拟
// ============================================================
const preprocessed = splitSkillsToUser(history, tags);
const promptMessages = formatPrompt(preprocessed, tags);

// --- strip_reasoning = ON ---
const stripped = stripReasoningFromPromptMessages(promptMessages);
const apiMessagesOn = toApiMessages(stripped.messages, true);

// --- strip_reasoning = OFF ---
const apiMessagesOff = toApiMessages(promptMessages, true);

// ============================================================
//  对比
// ============================================================
const origAssistant = promptMessages.filter((m) => m.role === "assistant");
const origWithReasoning = origAssistant.filter((m) => m.reasoning);
const origTotalReasoning = origWithReasoning.reduce(
  (s, m) => s + (m.reasoning?.length || 0),
  0,
);

const strippedAssistant = stripped.messages.filter(
  (m) => m.role === "assistant",
);
const strippedWithReasoning = strippedAssistant.filter((m) => m.reasoning);
const strippedTotalReasoning = strippedWithReasoning.reduce(
  (s, m) => s + (m.reasoning?.length || 0),
  0,
);

console.log("=== strip_reasoning 效果对比 (ON vs OFF) ===\n");

console.log(`PromptMessage 总数: ${promptMessages.length}`);

// Reasoning
console.log(`\n--- Reasoning ---`);
console.log(
  `剥离前: ${origWithReasoning.length}/${origAssistant.length} 条 assistant 含 reasoning, 总计 ${origTotalReasoning.toLocaleString()} 字符`,
);
console.log(
  `剥离后: ${strippedWithReasoning.length}/${strippedAssistant.length} 条 assistant 含 reasoning, 总计 ${strippedTotalReasoning.toLocaleString()} 字符`,
);
const saved = origTotalReasoning - strippedTotalReasoning;
console.log(
  `节省: ${saved.toLocaleString()} chars (~${Math.round(saved / 4).toLocaleString()} tokens)`,
);

if (strippedWithReasoning.length > 0) {
  console.log(`\n保留 reasoning 的 assistant 消息 (progress 之后):`);
  for (const m of strippedWithReasoning) {
    const idx = stripped.messages.indexOf(m);
    console.log(
      `  [${idx}] len=${m.reasoning?.length || 0}...`,
    );
  }
} else {
  console.log(`\n所有 assistant 的 reasoning 均已剥离`);
}

// Trigger prompt
console.log(`\n--- Trigger Prompt ---`);
const triggerInserted = stripped.lastProgressIdx >= 0;
console.log(`是否应插入: ${triggerInserted ? "是" : "否"}`);

// API message 对比
console.log(`\n--- API Message 输出 ---`);
console.log(`strip ON : ${apiMessagesOn.length} 条`);
console.log(`strip OFF: ${apiMessagesOff.length} 条`);

const totalLenOn = apiMessagesOn.reduce(
  (s, m) => s + (m.content?.length || 0) + (m.reasoning_content?.length || 0),
  0,
);
const totalLenOff = apiMessagesOff.reduce(
  (s, m) => s + (m.content?.length || 0) + (m.reasoning_content?.length || 0),
  0,
);
console.log(`\nstrip ON  总字符: ${totalLenOn.toLocaleString()}`);
console.log(`strip OFF 总字符: ${totalLenOff.toLocaleString()}`);
console.log(
  `差异: ${(totalLenOff - totalLenOn).toLocaleString()} chars (~${Math.round((totalLenOff - totalLenOn) / 4).toLocaleString()} tokens)`,
);

// strip_hint 效果
const toolResults = promptMessages.filter((m) => m.role === "tool");
const toolWithHint = toolResults.filter((m) =>
  m.content.includes("<system-hint>"),
);
console.log(`\n--- strip_hint (tool_result) ---`);
console.log(
  `tool 消息: ${toolWithHint.length}/${toolResults.length} 含 <system-hint>`,
);

const userMessages = promptMessages.filter((m) => m.role === "user");
const userWithHint = userMessages.filter((m) =>
  m.content.includes("<system-hint>"),
);
console.log(`\n--- strip_hint (user_input) ---`);
console.log(
  `user 消息: ${userWithHint.length}/${userMessages.length} 含 <system-hint>`,
);
