/**
 * config-from-config — TOML 配置 → ProviderConfig 映射
 *
 * 替代旧的 config-from-env.ts。
 * 输入类型从 config.ts 的 LLMConfigTOMLSchema 派生，无独立中间类型。
 */

import {
  type LLMConfigTOML,
  type ProviderConfig,
} from "./config.ts";

/**
 * 将 TOML 解析后的 LLM 配置映射为 ProviderConfig（discriminated union）。
 */
export function toProviderConfig(raw: LLMConfigTOML): ProviderConfig {
  const apiKey = raw.api_key;
  const model = raw.model;
  const baseUrl = raw.base_url;
  const type = raw.type;

  switch (type) {
    case "openai":
      return {
        provider: "openai",
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
      };

    case "anthropic": {
      const budgetTokens = raw.thinking_budget_tokens;
      const enableThinking = raw.thinking || raw.enable_thinking;
      const hasThinking = budgetTokens !== undefined || enableThinking;
      return {
        provider: "anthropic",
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
        ...(hasThinking
          ? { thinking: { budgetTokens: budgetTokens ?? 1024 } }
          : {}),
      };
    }

    case "google": {
      const effort = raw.thinking_effort as "low" | "medium" | "high" | undefined;
      return {
        provider: "google",
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
        ...(effort ? { thinkingEffort: effort } : {}),
      };
    }

    case "openai-compatible": {
      const backendProvider = raw.backend_provider as
        | "anthropic"
        | "google"
        | "openai"
        | undefined;
      const enableThinking = raw.enable_thinking || raw.thinking;
      return {
        provider: "openai-compatible",
        apiKey,
        model,
        baseUrl: baseUrl || "",
        ...(backendProvider ? { backendProvider } : {}),
        ...(enableThinking ? { enableThinking } : {}),
      };
    }

    case "deepseek": {
      const enableThinking = raw.enable_thinking || raw.thinking;
      const thinkingEffort = raw.thinking_effort as "high" | "max" | undefined;
      return {
        provider: "deepseek",
        apiKey,
        model,
        ...(baseUrl ? { baseUrl } : {}),
        ...(enableThinking ? { enableThinking } : {}),
        ...(thinkingEffort ? { thinkingEffort } : {}),
      };
    }

    default:
      throw new Error(
        `Unknown provider type: ${type}. Valid: openai, anthropic, google, deepseek, openai-compatible`,
      );
  }
}

/** 从 TOML 配置提取 edit_backend */
export function resolveEditBackend(raw: LLMConfigTOML): "str-replace" | "freeform-patch" {
  return raw.edit_backend === "freeform-patch" ? "freeform-patch" : "str-replace";
}
