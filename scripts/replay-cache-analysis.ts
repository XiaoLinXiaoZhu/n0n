/**
 * 对话重放 + 缓存命中分析
 *
 * 模拟 multi-turn 流程：每轮累积发送完整历史，对比相邻两轮请求的
 * 贪心前缀匹配长度，计算缓存命中/未命中 token。
 */
import { readFileSync } from "node:fs";
import { createTagAdapter, formatPrompt } from "@n0n/shared";
import {
  splitSkillsToUser,
  stripReasoningFromPromptMessages,
} from "../packages/llm/src/deepseek-test-1-client";
import type { DomainMessage, PromptMessage } from "@n0n/types";

// ── DSMessage ──
interface DSMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<{
    id: string; type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

function toApiMessages(msgs: PromptMessage[], enableThinking?: boolean): DSMessage[] {
  const result: DSMessage[] = [];
  for (const msg of msgs) {
    switch (msg.role) {
      case "system": result.push({ role: "system", content: msg.content }); break;
      case "user": result.push({ role: "user", content: msg.content }); break;
      case "assistant": {
        const base: DSMessage = {
          role: "assistant", content: msg.content || null,
          ...(enableThinking ? { reasoning_content: msg.reasoning ?? "" } : {}),
        };
        if (msg.toolCalls?.length) {
          base.tool_calls = msg.toolCalls.map(tc => ({
            id: tc.id, type: "function" as const,
            function: { name: tc.tool, arguments: JSON.stringify(tc.args) },
          }));
        }
        result.push(base); break;
      }
      case "tool":
        result.push({ role: "tool", content: msg.content, tool_call_id: msg.toolCallId }); break;
    }
  }
  return result;
}

// ── 工具函数 ──
const est = (chars: number) => Math.round(chars / 3.5);

function serializeDSMessages(msgs: DSMessage[]): string[] {
  return msgs.map(m => {
    let s = `[${m.role}]`;
    if (m.tool_call_id) s += `(tc=${m.tool_call_id})`;
    if (m.reasoning_content) s += m.reasoning_content;
    if (m.content) s += m.content;
    if (m.tool_calls) s += JSON.stringify(m.tool_calls);
    return s;
  });
}

function greedyPrefixMatch(a: string[], b: string[]): number {
  let matched = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const sa = a[i]!, sb = b[i]!;
    if (sa === sb) { matched += sa.length; continue; }
    let j = 0;
    while (j < sa.length && j < sb.length && sa[j] === sb[j]) j++;
    matched += j;
    break;
  }
  return matched;
}

interface RTokenCount { system: number; user: number; reasoning: number; tool: number; content: number; }

function countTokens(msgs: DSMessage[]): RTokenCount {
  let system = 0, user = 0, reasoning = 0, tool = 0, content = 0;
  for (const m of msgs) {
    const c = (m.content?.length || 0);
    const r = (m.reasoning_content?.length || 0);
    if (m.role === "system") system += c;
    else if (m.role === "user") user += c;
    else if (m.role === "tool") tool += c;
    else if (m.role === "assistant") { reasoning += r; content += c; }
  }
  return { system: est(system), user: est(user), reasoning: est(reasoning), tool: est(tool), content: est(content) };
}

function totalT(t: RTokenCount) { return t.system + t.user + t.reasoning + t.content + t.tool; }

// ── 轮次 ──
interface Round { startIdx: number; endIdx: number; hasProgress: boolean; }
function splitRounds(h: DomainMessage[]): Round[] {
  const rounds: Round[] = [];
  let start = -1;
  for (let i = 0; i < h.length; i++) {
    const m = h[i]; if (!m) continue;
    if (m.type === "user_input" || m.type === "idle_nudge" || m.type === "turn_feedback") {
      if (start >= 0) rounds.push({ startIdx: start, endIdx: i - 1, hasProgress: false });
      start = i;
    }
  }
  if (start >= 0) rounds.push({ startIdx: start, endIdx: h.length - 1, hasProgress: false });
  for (const r of rounds) {
    for (let i = r.startIdx; i <= r.endIdx; i++) {
      const m = h[i];
      if (m?.type === "assistant_tool_call" && m.toolCalls?.some((tc: any) => tc.tool === "progress"))
        { r.hasProgress = true; break; }
    }
  }
  return rounds;
}

interface RoundResult {
  round: number; tokens: RTokenCount; total: number; hit: number; miss: number; hitPct: string;
  hasProgress: boolean; hasStrip: boolean;
}

function replay(
  history: DomainMessage[], rounds: Round[], tags: ReturnType<typeof createTagAdapter>,
  stripHint: boolean, stripReasoning: boolean,
): RoundResult[] {
  const results: RoundResult[] = [];
  let prevSerialized: string[] = [];

  for (let r = 0; r < rounds.length; r++) {
    const round = rounds[r]!;
    const upTo = history.slice(0, round.endIdx + 1);
    const preprocessed = splitSkillsToUser(upTo, tags);
    let prompt = formatPrompt(preprocessed, tags, { strip_hint: stripHint });

    let hasStrip = false;
    if (stripReasoning) {
      const stripped = stripReasoningFromPromptMessages(prompt);
      prompt = stripped.messages;
      if (stripped.lastShowIdx >= 0) {
        hasStrip = true;
        prompt = [
          ...prompt.slice(0, stripped.lastShowIdx + 1),
          { role: "user" as const, content: "[TRIGGER]" },
          ...prompt.slice(stripped.lastShowIdx + 1),
        ];
      }
    }

    const api = toApiMessages(prompt, true);
    const serialized = serializeDSMessages(api);
    const tokens = countTokens(api);

    let hit = 0;
    if (prevSerialized.length > 0) {
      hit = est(greedyPrefixMatch(prevSerialized, serialized));
    }
    const total = totalT(tokens);
    const miss = Math.max(0, total - hit);
    const hitPct = total > 0 ? ((hit / total) * 100).toFixed(0) + "%" : "N/A";

    results.push({ round: r + 1, tokens, total, hit, miss, hitPct, hasProgress: round.hasProgress, hasStrip });
    prevSerialized = serialized;
  }
  return results;
}

// ═══════════════════════ MAIN ═══════════════════════

const raw = readFileSync("n0n-conversation-20260605-124433.json", "utf-8");
const history: DomainMessage[] = JSON.parse(raw).history;
const tags = createTagAdapter("deepseek");
const rounds = splitRounds(history);

interface Config { name: string; stripHint: boolean; stripReasoning: boolean; }
const configs: Config[] = [
  { name: "baseline (both OFF)", stripHint: false, stripReasoning: false },
  { name: "strip_hint only", stripHint: true, stripReasoning: false },
  { name: "strip_reasoning only", stripHint: false, stripReasoning: true },
  { name: "both ON", stripHint: true, stripReasoning: true },
];

const allConfigResults = configs.map(c => ({
  ...c,
  results: replay(history, rounds, tags, c.stripHint, c.stripReasoning),
}));

// ── 逐配置详表 ──
for (const cfg of allConfigResults) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`  ${cfg.name}`);
  console.log(`${"=".repeat(100)}`);

  const hdr = "Round  Progress  Strip   Total   Hit    Miss   Hit%   |  System   User   Input  Reason   Tool";
  console.log(`\n${hdr}`);
  console.log("-".repeat(100));

  let sumTotal = 0, sumHit = 0, sumMiss = 0, sumSys = 0, sumUser = 0, sumInput = 0, sumReason = 0, sumTool = 0;

  for (const r of cfg.results) {
    const pg = r.hasProgress ? "  ✓  " : "     ";
    const st = r.hasStrip ? "  ✓  " : "     ";
    const input = r.tokens.system + r.tokens.user + r.tokens.content;
    console.log(
      `R${String(r.round).padEnd(3)}  ${pg}  ${st}  ${String(r.total).padStart(5)}  ${String(r.hit).padStart(5)}  ${String(r.miss).padStart(5)}  ${r.hitPct.padStart(5)}  | ${String(r.tokens.system).padStart(6)}  ${String(r.tokens.user).padStart(5)}  ${String(input).padStart(5)}  ${String(r.tokens.reasoning).padStart(5)}  ${String(r.tokens.tool).padStart(5)}`,
    );
    sumTotal += r.total; sumHit += r.hit; sumMiss += r.miss;
    sumSys += r.tokens.system; sumUser += r.tokens.user; sumInput += input;
    sumReason += r.tokens.reasoning; sumTool += r.tokens.tool;
  }

  console.log("-".repeat(100));
  const avgHit = sumTotal > 0 ? ((sumHit / sumTotal) * 100).toFixed(0) + "%" : "N/A";
  console.log(
    `SUM                         ${String(sumTotal).padStart(5)}  ${String(sumHit).padStart(5)}  ${String(sumMiss).padStart(5)}  ${avgHit.padStart(5)}  | ${String(sumSys).padStart(6)}  ${String(sumUser).padStart(5)}  ${String(sumInput).padStart(5)}  ${String(sumReason).padStart(5)}  ${String(sumTool).padStart(5)}`,
  );
}

// ── 对比总表 ──
console.log(`\n${"=".repeat(100)}`);
console.log(`  跨配置对比 (5 轮累计)`);
console.log(`${"=".repeat(100)}`);

const hdr2 = "Config                        Total     Hit    Miss   Hit%    Reason   Tool   Input(non-sys)";
console.log(`\n${hdr2}`);
console.log("-".repeat(90));

for (const cfg of allConfigResults) {
  let sumTotal = 0, sumHit = 0, sumMiss = 0, sumReason = 0, sumTool = 0, sumInput = 0, sumSys = 0;
  for (const r of cfg.results) {
    sumTotal += r.total; sumHit += r.hit; sumMiss += r.miss;
    sumReason += r.tokens.reasoning; sumTool += r.tokens.tool;
    sumSys += r.tokens.system;
    sumInput += r.tokens.user + r.tokens.content;
  }
  const avgHit = sumTotal > 0 ? ((sumHit / sumTotal) * 100).toFixed(0) + "%" : "N/A";
  console.log(
    `${cfg.name.padEnd(30)} ${String(sumTotal).padStart(6)}  ${String(sumHit).padStart(6)}  ${String(sumMiss).padStart(6)}  ${avgHit.padStart(5)}  ${String(sumReason).padStart(6)}  ${String(sumTool).padStart(6)}  ${String(sumInput).padStart(10)}`,
  );
}

// ── 节省 vs baseline ──
console.log(`\n--- 相对 baseline 节省 (累计未命中 token) ---`);
const baseline = allConfigResults[0]!;
for (let i = 1; i < allConfigResults.length; i++) {
  const cfg = allConfigResults[i]!;
  let bMiss = 0, cMiss = 0;
  for (let r = 0; r < cfg.results.length; r++) {
    bMiss += baseline.results[r]!.miss;
    cMiss += cfg.results[r]!.miss;
  }
  const saved = bMiss - cMiss;
  const pct = bMiss > 0 ? ((saved / bMiss) * 100).toFixed(1) + "%" : "N/A";
  console.log(`  ${cfg.name.padEnd(30)}: miss ${String(bMiss).padStart(5)} → ${String(cMiss).padStart(5)}, 节省 ${String(saved).padStart(5)} tokens (${pct})`);
}
