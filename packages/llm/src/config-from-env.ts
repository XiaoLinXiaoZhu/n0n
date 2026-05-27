/**
 * 从环境变量构造 ProviderConfig / LLMConfig — SSOT 工厂函数
 *
 * runtime.ts 和 bootstrap/runner.ts 都调用此模块，
 * 避免重复实现 env → ProviderConfig 的映射逻辑。
 *
 * 新增 provider 时只需修改：
 * 1. config.ts 中的 ProviderConfig union（类型）
 * 2. factory.ts 中的 createLLMClient switch（实例化）
 * 3. 本文件的 buildProviderConfigFromEnv switch（env 映射）
 * — TS exhaustive check 会在遗漏时编译报错。
 */

import { isLLMProvider, LLM_PROVIDERS, type LLMProvider } from "@n0n/types";
import type { LLMConfig, ProviderConfig } from "./config.ts";

/** 扁平 key-value 配置源 — 从 .env / 环境变量加载后的纯数据 */
export type ConfigSource = Record<string, string>;

/** Anthropic thinking 模式的默认 token 预算 */
const DEFAULT_ANTHROPIC_THINKING_BUDGET = 1024;

// ── 环境变量读取工具 ──

/**
 * 从环境变量读取值，支持 fallback 和类型转换。
 *
 * @param prefix 环境变量前缀
 * @param field 字段名（拼接为 `${prefix}_${field}`）
 * @param fallbackValue 环境变量未设置时的回退值
 */
function env(
	source: ConfigSource,
	prefix: string,
	field: string,
	fallbackValue = "",
): string {
	return source[`${prefix}_${field}`] || fallbackValue;
}

/** 读取布尔值环境变量（"true" → true，其他 → false） */
function envBool(source: ConfigSource, prefix: string, field: string): boolean {
	return source[`${prefix}_${field}`] === "true";
}

/** 读取整数环境变量，无效值返回 undefined */
function envInt(
	source: ConfigSource,
	prefix: string,
	field: string,
): number | undefined {
	const raw = source[`${prefix}_${field}`];
	if (!raw) return undefined;
	const parsed = Number.parseInt(raw, 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * 读取枚举环境变量，值不在合法列表中时返回 undefined。
 *
 * @param prefix 环境变量前缀
 * @param field 字段名
 * @param allowed 合法值列表
 */
function envEnum<T extends string>(
	source: ConfigSource,
	prefix: string,
	field: string,
	allowed: readonly T[],
): T | undefined {
	const raw = source[`${prefix}_${field}`];
	if (!raw) return undefined;
	return (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
}

// ── Provider 类型解析 ──

/** @deprecated 使用 LLM_PROVIDERS（from @n0n/types） */
export const PROVIDER_TYPES = LLM_PROVIDERS;

/** @deprecated 使用 isLLMProvider（from @n0n/types） */
export const isValidProvider = isLLMProvider;

/**
 * 从环境变量解析 provider 类型
 *
 * 不做基于 URL 的模糊推断 — 非严格映射的自动判断本质上不稳定，
 * provider 类型必须由用户显式配置决定。
 *
 * 规则：
 * - 有显式 provider 值且合法时直接使用
 * - 无显式 provider 时，默认 "openai"
 */
export function resolveProvider(explicit?: string): LLMProvider {
	if (explicit && isValidProvider(explicit)) {
		return explicit;
	}
	return "openai";
}

// ── 主函数 ──

/**
 * 从环境变量前缀构造 ProviderConfig
 *
 * 行为参数按 provider 分支组装——每个分支只读取自己有意义的环境变量。
 *
 * @param prefix 环境变量前缀（如 "LLM" → 读 LLM_API_KEY、LLM_MODEL 等）
 * @param fallback 回退配置（如 EDITOR_LLM 回退到主 LLM）
 */
export function buildProviderConfigFromEnv(
	source: ConfigSource,
	prefix: string,
	fallback?: ProviderConfig,
): ProviderConfig {
	const apiKey = env(source, prefix, "API_KEY", fallback?.apiKey);
	const model = env(source, prefix, "MODEL", fallback?.model);
	const baseUrl =
		env(source, prefix, "BASE_URL") ||
		(fallback && "baseUrl" in fallback
			? (fallback as { baseUrl?: string }).baseUrl
			: undefined);
	const provider = resolveProvider(env(source, prefix, "PROVIDER"));

	switch (provider) {
		case "openai":
			return {
				provider: "openai",
				apiKey,
				model,
				...(baseUrl ? { baseUrl } : {}),
			};

		case "anthropic": {
			const validBudget = envInt(source, prefix, "THINKING_BUDGET_TOKENS");
			const enableFlag = envBool(source, prefix, "ENABLE_THINKING");
			// 兼容：ENABLE_THINKING=true 但没设 budget 时，用默认 budget
			const hasThinking = validBudget !== undefined || enableFlag;
			return {
				provider: "anthropic",
				apiKey,
				model,
				...(baseUrl ? { baseUrl } : {}),
				...(hasThinking
					? {
							thinking: {
								budgetTokens: validBudget ?? DEFAULT_ANTHROPIC_THINKING_BUDGET,
							},
						}
					: {}),
			};
		}

		case "google": {
			const thinkingEffort = envEnum(source, prefix, "THINKING_EFFORT", [
				"low",
				"medium",
				"high",
			] as const);
			return {
				provider: "google",
				apiKey,
				model,
				...(baseUrl ? { baseUrl } : {}),
				...(thinkingEffort ? { thinkingEffort } : {}),
			};
		}

		case "openai-compatible": {
			const backendProvider = envEnum(source, prefix, "BACKEND_PROVIDER", [
				"anthropic",
				"google",
				"openai",
			] as const);
			const enableThinking = envBool(source, prefix, "ENABLE_THINKING");
			return {
				provider: "openai-compatible",
				apiKey,
				model,
				baseUrl: baseUrl ?? "",
				...(backendProvider ? { backendProvider } : {}),
				...(enableThinking ? { enableThinking } : {}),
			};
		}

		case "deepseek": {
			const enableThinking = envBool(source, prefix, "ENABLE_THINKING");
			const thinkingEffort = envEnum(source, prefix, "THINKING_EFFORT", [
				"high",
				"max",
			] as const);
			return {
				provider: "deepseek",
				apiKey,
				model,
				...(baseUrl ? { baseUrl } : {}),
				...(enableThinking ? { enableThinking } : {}),
				...(thinkingEffort ? { thinkingEffort } : {}),
			};
		}
		default: {
			const _exhaustive: never = provider;
			throw new Error(`Unknown provider: ${_exhaustive}`);
		}
	}
}

/**
 * 从环境变量前缀构造 LLMConfig
 *
 * @param prefix 环境变量前缀（如 "LLM"）
 * @param fallbackProvider 回退 ProviderConfig
 */
export function buildLLMConfigFromEnv(
	source: ConfigSource,
	prefix: string,
	fallbackProvider?: ProviderConfig,
): LLMConfig {
	return {
		providerConfig: buildProviderConfigFromEnv(
			source,
			prefix,
			fallbackProvider,
		),
	};
}
