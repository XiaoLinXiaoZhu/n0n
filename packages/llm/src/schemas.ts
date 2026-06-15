/**
 * LLM API 响应 Schema — 系统边界 parse
 *
 * 各 Client 在 complete() 中对 HTTP 响应体做裸 as 断言，
 * 数据以宽松类型进入系统。本模块提供精确的 zod schema，
 * 在边界处完成解析，后续代码拿到的是已验证的类型。
 */

import { z } from "zod";

// ── OpenAI Chat Completions 响应（OpenAI / DeepSeek / Gemini / openai-compatible 共用）──

export const ChatCompletionSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z
					.object({
						content: z.string().nullable(),
					})
					.optional(),
			}),
		)
		.optional(),
});

export type ChatCompletion = z.infer<typeof ChatCompletionSchema>;

/**
 * 从 Chat Completions 响应中提取文本内容。
 * 边界处调用此函数而非裸 as + 可选链，
 * 确保非法响应在入口处被捕获。
 */
export function parseChatCompletionText(json: unknown): string {
	const parsed = ChatCompletionSchema.parse(json);
	return parsed?.choices?.[0]?.message?.content ?? "";
}

// ── Anthropic Messages API 响应 ──

export const AnthropicCompletionSchema = z.object({
	content: z
		.array(
			z.object({
				type: z.string(),
				text: z.string().optional(),
			}),
		)
		.optional(),
});

export type AnthropicCompletion = z.infer<typeof AnthropicCompletionSchema>;

export function parseAnthropicCompletionText(json: unknown): string {
	const parsed = AnthropicCompletionSchema.parse(json);
	const textBlock = parsed?.content?.find((b) => b.type === "text");
	return textBlock?.text ?? "";
}

// ── Anthropic usage（heartbeat 返回）──

export const AnthropicUsageSchema = z.object({
	usage: z
		.object({
			input_tokens: z.number().optional(),
			output_tokens: z.number().optional(),
			cache_creation_input_tokens: z.number().optional(),
			cache_read_input_tokens: z.number().optional(),
		})
		.optional(),
});

export type AnthropicUsage = z.infer<typeof AnthropicUsageSchema>;
