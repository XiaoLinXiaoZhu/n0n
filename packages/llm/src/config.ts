/**
 * LLM 配置类型 — Single Source of Truth
 *
 * ProviderConfig 是 discriminated union on `provider`，各分支自包含——
 * 不共享 base schema，因为不同 provider 的同名字段语义不同
 * （如 base_url 在 openai-compatible 是必填，在 openai 是可选）。
 *
 * 字段名与 API 请求体一致（snake_case），不做命名风格转换。
 * Client 代码直接从 ProviderConfig 赋值到请求体，无需映射层。
 *
 * parse, don't verify：有默认回退的字段在 parse 时填入默认值，
 * 消费方拿到的类型不含 optional，不存在不确定传播。
 */

import { z } from "zod";

// ═══════════════════════════════════════════════════════════
// ProviderConfig — discriminated union on `provider`
// ═══════════════════════════════════════════════════════════

export const OpenAIProviderConfigSchema = z.object({
	provider: z.literal("openai"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string().default("https://api.openai.com"),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("default"),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type OpenAIProviderConfig = z.infer<typeof OpenAIProviderConfigSchema>;

export const AnthropicProviderConfigSchema = z.object({
	provider: z.literal("anthropic"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string().default("https://api.anthropic.com"),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("default"),
	thinking: z
		.object({
			type: z.literal("enabled"),
			budget_tokens: z.number(),
		})
		.optional(),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type AnthropicProviderConfig = z.infer<
	typeof AnthropicProviderConfigSchema
>;

export const GoogleProviderConfigSchema = z.object({
	provider: z.literal("google"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string().default("https://generativelanguage.googleapis.com"),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("default"),
	reasoning_effort: z.enum(["low", "medium", "high"]).default("high"),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type GoogleProviderConfig = z.infer<typeof GoogleProviderConfigSchema>;

export const OpenAICompatibleProviderConfigSchema = z.object({
	provider: z.literal("openai-compatible"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string(),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("default"),
	backend_provider: z.enum(["anthropic", "google", "openai"]).default("openai"),
	enable_thinking: z.boolean().default(false),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type OpenAICompatibleProviderConfig = z.infer<
	typeof OpenAICompatibleProviderConfigSchema
>;

export const DeepSeekProviderConfigSchema = z.object({
	provider: z.literal("deepseek"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string().default("https://api.deepseek.com"),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("deepseek"),
	system_tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("deepseek"),
	enable_thinking: z.boolean().default(false),
	reasoning_effort: z.enum(["high", "max"]).optional(),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type DeepSeekProviderConfig = z.infer<
	typeof DeepSeekProviderConfigSchema
>;

export const DeepSeekTest1ProviderConfigSchema = z.object({
	provider: z.literal("deepseek-test-1"),
	api_key: z.string(),
	model: z.string(),
	base_url: z.string().default("https://api.deepseek.com"),
	tag_style: z
		.enum(["deepseek", "glm", "minimax", "default"])
		.default("deepseek"),
	enable_thinking: z.boolean().default(false),
	strip_reasoning: z.boolean().default(false),
	reasoning_effort: z.enum(["high", "max"]).optional(),
	edit_backend: z
		.enum(["str-replace", "freeform-patch"])
		.default("str-replace"),
});
export type DeepSeekTest1ProviderConfig = z.infer<
	typeof DeepSeekTest1ProviderConfigSchema
>;

export const ProviderConfigSchema = z.discriminatedUnion("provider", [
	OpenAIProviderConfigSchema,
	AnthropicProviderConfigSchema,
	GoogleProviderConfigSchema,
	OpenAICompatibleProviderConfigSchema,
	DeepSeekProviderConfigSchema,
	DeepSeekTest1ProviderConfigSchema,
]);

/** 统一的 LLM provider 配置 — discriminated union on `provider` */
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

type _AssertExhaustive =
	Exclude<LLMProvider, ProviderConfig["provider"]> extends never ? true : never;
const _: _AssertExhaustive = true;
