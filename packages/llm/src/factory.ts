/**
 * LLM Client 工厂函数
 *
 * 唯一的 Client 创建入口。负责：
 * 1. 确定 tagStyle 和构造 TagAdapter
 * 2. 绑定 formatPrompt + FormatOptions 为 FormatFn 闭包
 * 3. 将闭包注入 Client — Client 不感知 formatPrompt 的存在
 */

import {
	createTagAdapter,
	detectTagStyle,
	type FormatOptions,
	formatPrompt,
} from "@n0n/shared";
import type { DomainMessage, LLMClient, PromptMessage } from "@n0n/types";
import { AnthropicClient } from "./anthropic-client.ts";
import type { LLMConfig } from "./config.ts";
import { DeepSeekClient } from "./deepseek-client/index.ts";
import { GeminiClient } from "./gemini-client.ts";
import { OpenAIClient } from "./openai-client.ts";

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
	const tagStyle = pc.tagStyle ?? detectTagStyle(pc.model);
	const tags = createTagAdapter(tagStyle);
	const format: FormatFn = (msgs) => formatPrompt(msgs, tags, formatOptions);

	switch (pc.provider) {
		case "openai":
		case "openai-compatible":
			return new OpenAIClient(pc, tagStyle, tags, format);
		case "anthropic":
			return new AnthropicClient(pc, tagStyle, tags, format);
		case "google":
			return new GeminiClient(pc, tagStyle, tags, format);
		case "deepseek": {
			const deepseekTags = createTagAdapter("deepseek");
			const systemFormat: FormatFn = (msgs) =>
				formatPrompt(msgs, deepseekTags, formatOptions);
			return new DeepSeekClient(pc, tagStyle, tags, format, systemFormat);
		}
	}
}
