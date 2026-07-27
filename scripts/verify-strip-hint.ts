/**
 * 验证脚本：模拟 deepseek-test-1 的完整消息处理管道
 *
 * 用 n0n-conversation-20260606-014008.json 中的实际 DomainMessage，
 * 模拟 splitSkillsToUser → formatPrompt → stripReasoning → trigger prompt injection，
 * 检查 strip_hint 机制是否按要求剥离了历史轮次的 system-hint。
 */

import { readFileSync } from "fs";

// ── 加载日志 ──

const logPath = "n0n-conversation-20260606-014008.json";
const log = JSON.parse(readFileSync(logPath, "utf-8"));
const history = log.history;

console.log("=" .repeat(70));
console.log("验证：deepseek-test-1 strip_hint + trigger prompt 机制");
console.log("=".repeat(70));

// ── 导入依赖 ──

import { createTagAdapter } from "@n0n/shared";
import { formatPrompt, formatSkills } from "@n0n/format-prompt";
import type { DomainMessage, PromptMessage, TagAdapter } from "@n0n/types";
import { splitSkillsToUser, stripReasoningFromPromptMessages } from "../packages/llm/src/deepseek-test-1-client";
import triggerPromptRaw from "../packages/llm/src/deepseek-test-1-client/trigger-prompt.md" with { type: "text" };
const triggerPromptContent = triggerPromptRaw.replace(/<!--[\s\S]*?-->/g, "").trim();

const tags = createTagAdapter("deepseek");
const formatOptions = { strip_hint: true };

// ── 模拟每个 API 调用的消息积累 ──

// 找到每个 assistant_tool_call 在 history 中的位置，这些是 API 调用的结束边界
const atcIndices: number[] = [];
for (let i = 0; i < history.length; i++) {
  if (history[i]?.type === "assistant_tool_call") {
    atcIndices.push(i);
  }
}

console.log(`\n共 ${atcIndices.length} 个 assistant_tool_call (API 调用)`);

// 对每个 API 调用，模拟当时累积的消息
for (let callIdx = 0; callIdx < atcIndices.length; callIdx++) {
  const endIdx = atcIndices[callIdx];
  // 此 API 调用的输入是 atcIdx 之前的所有消息（不包括 atc 本身）
  // 但需要包括 atc 之前的 token_usage 等
  const inputMessages = history.slice(0, endIdx) as DomainMessage[];

  console.log(`\n${"-".repeat(60)}`);
  console.log(`API 调用 #${callIdx + 1}: 输入消息数 = ${inputMessages.length}`);
  console.log(`最后一条: type=${inputMessages[inputMessages.length - 1]?.type}`);

  // Step 1: splitSkillsToUser
  const preprocessed = splitSkillsToUser(inputMessages, tags);

  // Step 2: formatPrompt
  const format: (msgs: DomainMessage[]) => PromptMessage[] =
    (msgs) => formatPrompt(msgs, tags, formatOptions);
  let promptMessages = format(preprocessed);

  // Step 3: stripReasoning
  const { messages: stripped, lastShowIdx } =
    stripReasoningFromPromptMessages(promptMessages);
  promptMessages = stripped;

  // Step 4: Insert trigger prompt
  if (lastShowIdx >= 0) {
    const triggerUserMsg: PromptMessage = {
      role: "user",
      content: triggerPromptContent,
    };
    promptMessages = [
      ...promptMessages.slice(0, lastShowIdx + 1),
      triggerUserMsg,
      ...promptMessages.slice(lastShowIdx + 1),
    ];
  }

  // ── 分析结果 ──

  // 检查 system-hint 是否在历史轮次中被剥离
  let hintCount = 0;
  let strippedHintCount = 0;
  const hintMessages: { idx: number; role: string; hasHint: boolean; isLatest: boolean; snippet: string }[] = [];

  // 先找到 promptMessages 中最后一个 assistant_tool_call 的位置（对应 format 中的 lastAtcIndex）
  // 但由于 promptMessages 是 format 后的，我们需要另一种方式判断
  // 简单地检查所有 tool_result 的 content 中是否包含 system-hint

  for (let i = 0; i < promptMessages.length; i++) {
    const pm = promptMessages[i];
    if (!pm) continue;
    if (pm.role === "tool" && "toolName" in pm) {
      const hasHint = pm.content.includes("【system-hint】") || pm.content.includes("<system-hint>");
      const isProgress = (pm as any).toolName === "show";
      hintMessages.push({
        idx: i,
        role: `tool(${(pm as any).toolName})`,
        hasHint,
        isLatest: false, // 稍后填充
        snippet: pm.content.slice(0, 100),
      });
      if (hasHint) hintCount++;
      else strippedHintCount++;
    }
    if (pm.role === "user" && (pm.content.includes("【system-hint】") || pm.content.includes("<system-hint>"))) {
      hintMessages.push({
        idx: i,
        role: "user",
        hasHint: true,
        isLatest: false,
        snippet: pm.content.slice(0, 100),
      });
      hintCount++;
    }
  }

  // 判断哪些是最新轮
  // 最新轮的定义：在最后一个 assistant_tool_call 之后的 tool_result
  // 在 promptMessages 中找最后一个 role==="assistant" 且有 toolCalls 的消息
  let lastAssistantIdx = -1;
  for (let i = promptMessages.length - 1; i >= 0; i--) {
    const pm = promptMessages[i];
    if (pm?.role === "assistant" && "toolCalls" in pm && pm.toolCalls?.length) {
      lastAssistantIdx = i;
      break;
    }
  }

  // 标记最新轮
  for (const hm of hintMessages) {
    hm.isLatest = hm.idx > lastAssistantIdx;
  }

  console.log(`\n  Format 后的消息数: ${promptMessages.length}`);
  console.log(`  最后一个 assistant_tool_call (PromptMessage): index=${lastAssistantIdx}`);
  console.log(`  lastShowIdx: ${lastShowIdx}`);
  console.log(`  system-hint 含/不含: ${hintCount}/${strippedHintCount}`);

  if (hintMessages.length > 0) {
    console.log(`\n  Tool result 详情:`);
    for (const hm of hintMessages) {
      const marker = hm.hasHint
        ? (hm.isLatest ? "✓HINT(最新轮)" : "✗HINT(历史轮—未剥离!)")
        : (hm.isLatest ? "?NOHINT(最新轮—被误剥离?)" : "✓NOHINT(已剥离)");
      console.log(`    [${hm.idx}] ${hm.role} ${marker}`);
      console.log(`         ${hm.snippet}`);
    }
  }

  // 检查 trigger prompt 注入
  const triggerInjected = promptMessages.some(
    (pm) => pm.role === "user" && pm.content === triggerPromptContent
  );
  console.log(`\n  Trigger prompt 注入: ${triggerInjected ? "是" : "否"}`);

  // 检查 reasoning 剥离
  let reasoningCount = 0;
  let strippedReasoningCount = 0;
  for (let i = 0; i < promptMessages.length; i++) {
    const pm = promptMessages[i];
    if (pm?.role === "assistant" && "reasoning" in pm && pm.reasoning) {
      reasoningCount++;
    }
  }
  console.log(`  Assistant reasoning 保留: ${reasoningCount}`);

  // 打印最终的消息角色序列
  const roleSeq = promptMessages.map(pm => {
    let r: string = pm.role;
    if (pm.role === "tool" && "toolName" in pm) r = `tool(${(pm as any).toolName})`;
    if (pm.role === "user" && pm.content === triggerPromptContent) r = "user(TRIGGER)";
    return r;
  });
  console.log(`\n  最终消息序列: ${roleSeq.join(" → ")}`);
}

console.log("\n" + "=".repeat(70));
console.log("验证完成");
console.log("=".repeat(70));
