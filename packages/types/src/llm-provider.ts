/**
 * LLM Provider 类型 — Single Source of Truth
 *
 * 所有需要区分 provider 的模块从此处导入，确保：
 * - 添加新 provider 时只改这一处类型定义
 * - TS exhaustive check 自动在所有 switch 处报错
 * - 不需要手动在多个地方保持同步
 *
 * 添加新 provider 步骤：
 * 1. 在 LLMProvider 类型和 LLM_PROVIDERS 数组中添加新值
 * 2. TS 会在以下位置报错（exhaustive check）：
 *    - packages/llm/config.ts — ProviderConfig discriminated union
 *    - packages/llm/factory.ts — createLLMClient switch
 * 3. 逐个修复即完成全链路适配
 */

/** 支持的 LLM provider 类型 */
export type LLMProvider =
	| "openai"
	| "openai-response"
	| "anthropic"
	| "google"
	| "deepseek"
	| "openai-compatible";

/** 所有合法 provider 值的运行时数组（与类型同步，satisfies 保证穷尽） */
export const LLM_PROVIDERS = [
	"openai",
	"openai-response",
	"anthropic",
	"google",
	"deepseek",
	"openai-compatible",
] as const satisfies readonly LLMProvider[];

/** 类型守卫：判断字符串是否为合法 provider */
export function isLLMProvider(value: string): value is LLMProvider {
	return (LLM_PROVIDERS as readonly string[]).includes(value);
}
