/**
 * 精确追踪：show 后第一次 API 调用的完整消息管道
 *
 * 输入: n0n-conversation-20260606-014008.json history[0..10]
 * 预期: 产生 index 11 的 assistant_tool_call (tools=[write])
 */

import { readFileSync } from "fs";

const log = JSON.parse(readFileSync("n0n-conversation-20260606-014008.json", "utf-8"));
const history = log.history;

import { createTagAdapter, formatPrompt } from "@n0n/shared";
import type { DomainMessage, PromptMessage } from "@n0n/types";
import { splitSkillsToUser, stripReasoningFromPromptMessages } from "../packages/llm/src/deepseek-test-1-client";
import triggerPromptRaw from "../packages/llm/src/deepseek-test-1-client/trigger-prompt.md" with { type: "text" };
const triggerPromptContent = triggerPromptRaw.replace(/<!--[\s\S]*?-->/g, "").trim();

const tags = createTagAdapter("deepseek");

// ── API Call 输入: history[0..10] (产生 index 11 的 atc) ──
// 这是 model 第一次调用 show 后，用户输入 "继续" 触发的调用
const inputMessages = history.slice(0, 11) as DomainMessage[];
console.log("输入消息数:", inputMessages.length);
for (let i = 0; i < inputMessages.length; i++) {
  const m = inputMessages[i];
  let extra = "";
  if (m?.type === "tool_result") extra = `tool=${(m as any).call?.tool}`;
  else if (m?.type === "user_input") extra = `hint="${(m as any).hint}" content="${(m as any).content?.slice(0, 30)}"`;
  else if (m?.type === "assistant_tool_call") extra = `tools=${(m as any).toolCalls?.map((t:any)=>t.tool).join(",")}`;
  console.log(`  [${i}] ${m?.type} ${extra}`);
}

console.log("\n=== Step 1: splitSkillsToUser ===");
const preprocessed = splitSkillsToUser(inputMessages, tags);
for (let i = 0; i < preprocessed.length; i++) {
  const m = preprocessed[i];
  let extra = "";
  if (m?.type === "generic_user_text") extra = `starts_with="${m.content.slice(0, 50)}"`;
  else if (m?.type === "tool_result") extra = `tool=${(m as any).call?.tool}`;
  else if (m?.type === "user_input") extra = `hint="${(m as any).hint}"`;
  else if (m?.type === "assistant_tool_call") extra = `tools=${(m as any).toolCalls?.map((t:any)=>t.tool).join(",")}`;
  console.log(`  [${i}] ${m?.type} ${extra}`);
}

console.log("\n=== Step 2: formatPrompt (strip_hint=true) ===");
const formatOptions = { strip_hint: true };
const format: (msgs: DomainMessage[]) => PromptMessage[] =
  (msgs) => formatPrompt(msgs, tags, formatOptions);
let promptMessages = format(preprocessed);

console.log(`共 ${promptMessages.length} 条 PromptMessage`);
for (let i = 0; i < promptMessages.length; i++) {
  const pm = promptMessages[i];
  if (!pm) continue;
  let extra = "";
  if (pm.role === "tool") {
    extra = `toolName=${(pm as any).toolName}`;
    const hasHint = pm.content.includes("【system-hint】") || pm.content.includes("<system-hint>");
    extra += ` hasHint=${hasHint}`;
  }
  if (pm.role === "user") {
    const isTrigger = pm.content === triggerPromptContent;
    const hasHint = pm.content.includes("【system-hint】");
    extra = `len=${pm.content.length} isTrigger=${isTrigger} hasHint=${hasHint}`;
    if (pm.content.length < 60) extra += ` content="${pm.content.slice(0, 60)}"`;
  }
  if (pm.role === "assistant") {
    const hasReasoning = !!(pm as any).reasoning;
    const hasToolCalls = !!(pm as any).toolCalls?.length;
    extra = `hasReasoning=${hasReasoning} hasToolCalls=${hasToolCalls}`;
  }
  console.log(`  [${i}] ${pm.role} ${extra}`);
}

console.log("\n=== Step 3: stripReasoningFromPromptMessages ===");
const { messages: stripped, lastShowIdx } = stripReasoningFromPromptMessages(promptMessages);
promptMessages = stripped;
console.log(`lastShowIdx = ${lastShowIdx}`);

// 检查 reasoning 状态
for (let i = 0; i < promptMessages.length; i++) {
  const pm = promptMessages[i];
  if (pm?.role === "assistant") {
    console.log(`  [${i}] assistant hasReasoning=${!!(pm as any).reasoning}`);
  }
}

console.log("\n=== Step 4: Inject trigger prompt ===");
if (lastShowIdx >= 0) {
  const triggerUserMsg: PromptMessage = {
    role: "user",
    content: triggerPromptContent,
  };
  promptMessages.push(triggerUserMsg);
  console.log(`在末尾追加 trigger prompt`);
}

console.log("\n=== 最终发送给 API 的消息序列 ===");
for (let i = 0; i < promptMessages.length; i++) {
  const pm = promptMessages[i];
  if (!pm) continue;
  let label: string = pm.role;
  if (pm.role === "tool") label = `tool(${(pm as any).toolName})`;
  if (pm.role === "user" && pm.content === triggerPromptContent) label = "TRIGGER";
  if (pm.role === "assistant") {
    const hasR = !!(pm as any).reasoning;
    const hasTC = !!(pm as any).toolCalls?.length;
    label = `assistant(R=${hasR},TC=${hasTC})`;
  }
  const preview = pm.content.slice(0, 80).replace(/\n/g, "\\n");
  console.log(`  [${i}] ${label} | ${preview}...`);
}

console.log("\n=== 关键检查 ===");
// 检查 trigger prompt 后面的消息
const triggerIdx = promptMessages.findIndex(
  pm => pm?.role === "user" && pm.content === triggerPromptContent
);
console.log(`Trigger prompt 在索引 ${triggerIdx}`);
if (triggerIdx >= 0 && triggerIdx + 1 < promptMessages.length) {
  const next = promptMessages[triggerIdx + 1];
  console.log(`下一条消息: role=${next?.role}, preview="${next?.content?.slice(0, 120)}"`);
}

// 检查 show tool_result 是否有 hint (progress 本身无 hint，这是正常的)
const showIdx = promptMessages.findIndex(
  pm => pm?.role === "tool" && (pm as any).toolName === "show"
);
console.log(`Show tool_result 在索引 ${showIdx}`);
if (showIdx >= 0) {
  const pp = promptMessages[showIdx];
  console.log(`Progress content: "${pp?.content}"`);
}

// 检查 usernput 的 hint
const userInputIdx = promptMessages.findIndex(
  pm => pm?.role === "user" && pm.content?.includes("【system-hint】")
);
console.log(`含 system-hint 的 user 消息在索引 ${userInputIdx}`);
