/**
 * LLM 配置类型 — Single Source of Truth
 *
 * 使用 zod schema 定义所有配置形状，TypeScript 类型从 schema 派生。
 * ProviderConfig 是 discriminated union，各分支具有独立的字段约束。
 *
 * 双套 schema：
 * - LLMConfigTOMLSchema: TOML 解析后的中间形状（snake_case，描述 settings.llm/editor）
 * - ProviderConfigSchema: 最终运行时配置（camelCase，discriminated union）
 * config-from-config.ts 负责两者之间的映射。
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// TOML 中间形状（snake_case，直接对应 TOML 字段名）
// ═══════════════════════════════════════════════════════════

/** TOML 解析后 settings.llm / settings.editor 的形状 */
export const LLMConfigTOMLSchema = z.object({
  type: z.string(),
  base_url: z.string().default(""),
  api_key: z.string(),
  model: z.string(),
  thinking: z.boolean().optional(),
  thinking_budget_tokens: z.number().optional(),
  thinking_effort: z.string().optional(),
  backend_provider: z.string().optional(),
  enable_thinking: z.boolean().optional(),
  edit_backend: z.string().optional(),
});

/** TOML → ProviderConfig 映射的输入类型 */
export type LLMConfigTOML = z.infer<typeof LLMConfigTOMLSchema>;

// ═══════════════════════════════════════════════════════════
// ProviderConfig（运行时 discriminated union）
// ═══════════════════════════════════════════════════════════

const providerBaseSchema = z.object({
  apiKey: z.string(),
  model: z.string(),
  baseUrl: z.string().optional(),
  tagStyle: z.string().optional(),
});

export const OpenAIProviderConfigSchema = providerBaseSchema.extend({
  provider: z.literal("openai"),
});
export type OpenAIProviderConfig = z.infer<typeof OpenAIProviderConfigSchema>;

export const AnthropicProviderConfigSchema = providerBaseSchema.extend({
  provider: z.literal("anthropic"),
  thinking: z
    .object({
      budgetTokens: z.number(),
    })
    .optional(),
});
export type AnthropicProviderConfig = z.infer<typeof AnthropicProviderConfigSchema>;

export const GoogleProviderConfigSchema = providerBaseSchema.extend({
  provider: z.literal("google"),
  thinkingEffort: z.enum(["low", "medium", "high"]).optional(),
});
export type GoogleProviderConfig = z.infer<typeof GoogleProviderConfigSchema>;

export const OpenAICompatibleProviderConfigSchema = providerBaseSchema.extend({
  provider: z.literal("openai-compatible"),
  baseUrl: z.string(),
  backendProvider: z.enum(["anthropic", "google", "openai"]).optional(),
  enableThinking: z.boolean().optional(),
});
export type OpenAICompatibleProviderConfig = z.infer<typeof OpenAICompatibleProviderConfigSchema>;

export const DeepSeekProviderConfigSchema = providerBaseSchema.extend({
  provider: z.literal("deepseek"),
  enableThinking: z.boolean().optional(),
  thinkingEffort: z.enum(["high", "max"]).optional(),
});
export type DeepSeekProviderConfig = z.infer<typeof DeepSeekProviderConfigSchema>;

export const ProviderConfigSchema = z.discriminatedUnion("provider", [
  OpenAIProviderConfigSchema,
  AnthropicProviderConfigSchema,
  GoogleProviderConfigSchema,
  OpenAICompatibleProviderConfigSchema,
  DeepSeekProviderConfigSchema,
]);

/** 统一的 LLM provider 运行时配置 */
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

// ═══════════════════════════════════════════════════════════
// LLMConfig
// ═══════════════════════════════════════════════════════════

export const LLMConfigSchema = z.object({
  providerConfig: ProviderConfigSchema,
});

export type LLMConfig = z.infer<typeof LLMConfigSchema>;

// ═══════════════════════════════════════════════════════════
// 穷尽性编译时校验
// ═══════════════════════════════════════════════════════════

import type { LLMProvider } from "@n0n/types";
type _AssertExhaustive = Exclude<LLMProvider, ProviderConfig["provider"]> extends never ? true : never;
const _: _AssertExhaustive = true;
