/**
 * LLM Client 工厂函数
 *
 * 唯一的 Client 创建入口。负责：
 * 1. 构造 TagAdapter（tag_style 由 schema 默认值保证，无需 fallback）
 * 2. 绑定 formatPrompt + FormatOptions 为 FormatFn 闭包
 * 3. 将闭包注入 Client — Client 不感知 formatPrompt 的存在
 */

import {
	createTagAdapter,
	type FormatOptions,
	formatPrompt,
} from "@n0n/shared";
import type { DomainMessage, LLMClient, PromptMessage } from "@n0n/types";
import { AnthropicClient } from "./anthropic-client.ts";
import type { LLMConfig } from "./config.ts";
import { DeepSeekClient } from "./deepseek-client/index.ts";
import { DeepSeekTest1Client } from "./deepseek-test-1-client/index.ts";
import { GeminiClient } from "./gemini-client.ts";
import { OpenAIClient } from "./openai-client.ts";
import { OpenAICompatibleClient } from "./openai-compatible-client.ts";

/** 格式化函数类型 — DomainMessage[] → PromptMessage[] */
export type FormatFn = (messages: DomainMessage[]) => PromptMessage[];

/**
 * 创建 LLMClient 实例
 *
 * @param config LLM 配置（含 provider 类型、凭据、行为开关）
 * @param formatOptions 格式化选项（控制 hint 剥离等行为）
 * @returns LLMClient 实例，闭包所有配置
 */
export function createLLMClient(
	config: LLMConfig,
	formatOptions?: FormatOptions,
): LLMClient {
	const pc = config.providerConfig;
	const tagStyle = pc.tag_style;
	const tags = createTagAdapter(tagStyle);
	const format: FormatFn = (msgs) => formatPrompt(msgs, tags, formatOptions);

	switch (pc.provider) {
		case "openai":
			return new OpenAIClient(pc, format);
		case "openai-compatible":
			return new OpenAICompatibleClient(pc, format);
		case "anthropic":
			return new AnthropicClient(pc, format);
		case "google":
			return new GeminiClient(pc, format);
		case "deepseek": {
			const deepseekTags = createTagAdapter(pc.system_tag_style);
			const systemFormat: FormatFn = (msgs) =>
				formatPrompt(msgs, deepseekTags, formatOptions);
			return new DeepSeekClient(pc, format, systemFormat);
		}
		case "deepseek-test-1": {
			return new DeepSeekTest1Client(pc, format, tags, pc.strip_reasoning);
		}
		default: {
			const _exhaustive: never = pc;
			throw new Error(
				`Unknown provider: ${(_exhaustive as { provider: string }).provider}`,
			);
		}
	}
}
