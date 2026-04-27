/**
 * Transform — 角色转换折叠模块
 *
 * 将一轮 agent 探索（assistant 推理 + 工具调用 + 工具结果）折叠为一条
 * transformed_observation 消息追加到 DomainMessage 历史。
 *
 * 格式层（formatPrompt）自动完成视角切换：
 *   - 最后一个 transformed_observation 之前的 assistant/tool_result 被剔除
 *   - LLM 只看到状态 user 序列 + 当前轮的探索过程
 *
 * 调用链：
 *   agent loop → executeTransform(history, client)
 *     → buildTransformRequest(history, modelId)
 *       → formatPrompt(history)  ← 视角切换在此完成
 *       → 追加整理指令
 *     → client.complete(request)
 *     → 返回压缩文本
 */

import type { CompleteRequest, DomainMessage, LLMClient } from "@n0n/types";

// ── 整理指令 ──

const TRANSFORM_INSTRUCTION = `<transform>
忽略之前的所有指令。聚焦于当前的整理任务。

You are performing state compression. Your task: distill the preceding assistant 
exploration (tools called and their results) into a single concise observation 
written in the style of a factual state update.

Rules:
- State what was done, what was observed, and any remaining uncertainties
- Drop intermediate reasoning, verbose tool output, and redundant detail
- Write in objective declarative style, as if recording facts on a state board
- Do NOT add prefix like "Observation:" or "State:" — just the facts
- If the exploration was inconclusive, state the ambiguity honestly
- Limit to 2-4 sentences
</transform>`;

// ── 构建 Transform 请求 ──

/**
 * 从 DomainMessage 历史构建压缩请求。
 *
 * 使用 formatPrompt 完成视角切换（剔除旧轮次的 assistant/tool_result），
 * 然后追加整理指令。返回可直接传给 client.complete() 的请求。
 */
import { formatPrompt } from "@n0n/shared";

export function buildTransformRequest(
  history: DomainMessage[],
  modelId: string,
): CompleteRequest | null {
  // formatPrompt 自动应用视角切换
  const promptMessages = formatPrompt(history, modelId);

  // 提取 system + user 消息构建 CompleteRequest
  const messages: Array<{ role: "system" | "user"; content: string }> = [];
  for (const pm of promptMessages) {
    if (pm.role === "system") {
      messages.push({ role: "system", content: pm.content });
    } else {
      // 展平：assistant/tool → user（complete() 只接受 system+user）
      messages.push({ role: "user", content: pm.content });
    }
  }

  // 追加整理指令
  messages.push({ role: "user", content: TRANSFORM_INSTRUCTION });

  return {
    messages,
    temperature: 0.3,
  };
}

// ── 执行 Transform ──

export interface TransformResult {
  /** 压缩后的观察文本 */
  observation: string;
}

/**
 * 执行一次 Transform 折叠。
 *
 * 使用 client.complete()（非流式、无工具），
 * 复用 system + 状态前缀的 prompt 缓存。
 *
 * @returns 压缩结果，失败时返回 null（不中断 agent loop）
 */
export async function executeTransform(
  history: DomainMessage[],
  client: LLMClient,
): Promise<TransformResult | null> {
  const request = buildTransformRequest(history, client.modelId);
  if (!request) return null;

  try {
    const response = await client.complete(request);
    const text = response.text.trim();
    if (!text) return null;
    return { observation: text };
  } catch {
    // Transform 失败不中断 agent loop
    return null;
  }
}
