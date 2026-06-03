/**
 * XML-like Tag 工具 — TagAdapter 工厂 + 纯函数底层
 *
 * 不同 LLM 模型对 XML-like 标签的理解不同，
 * 使用各模型训练时的原生标签风格可以获得更好的结构化理解效果。
 *
 * - GLM:      <tag> content </tag>
 * - Minimax:  ]~b]tag content [e~[
 * - DeepSeek: <tag> content </tag> (标准 XML 风格，system-hint 为唯一特例)
 * - 默认:     <tag> content </tag>  (标准 XML 风格)
 *
 * provider-specific 标签不由公共层处理——各 Client 内部按需使用。
 *
 * 各 LLM Client 通过 createTagAdapter(style) 构造 TagAdapter 实例，
 * 注入到 formatPrompt。
 */

import type { TagAdapter, TagStyle } from "@n0n/types";

export type { TagAdapter, TagStyle };

/** 生成开标签 */
export function openTag(style: TagStyle, name: string): string {
	switch (style) {
		case "minimax":
			return `]~b]${name}`;
		case "glm":
		case "deepseek":
		case "default":
			return `<${name}>`;
		default: {
			const _exhaustive: never = style;
			return `<${name}>`;
		}
	}
}

/** 生成闭标签 */
export function closeTag(style: TagStyle, name: string): string {
	switch (style) {
		case "minimax":
			return "[e~[";
		case "glm":
		case "deepseek":
		case "default":
			return `</${name}>`;
		default: {
			const _exhaustive: never = style;
			return `</${name}>`;
		}
	}
}

/**
 * 将文本中的标准 XML 标签替换为指定风格。
 * 匹配 <tagName> 和 </tagName> 形式。
 */
function adaptTagsByStyle(text: string, style: TagStyle): string {
	if (style === "default" || style === "glm") return text;

	if (style === "deepseek") {
		return text.replace(
			/<system-hint>([\s\S]*?)<\/system-hint>/g,
			(_, content) => `【system-hint】\n${content.trim()}\n---
【思维模式要求】在你的思考过程（<think>标签内）中，请遵守以下规则：
1. 禁止使用假设，所有分析内容直接陈述即可。
2. 禁止反复纠结，使用reason工具进行结构化的推理，使用topK的思路，允许多种可能的假设并存，然后逐一验证。
3. 思考内容应聚焦于分析从【当前状态】到【目标状态】所需要的任意个观察和执行步骤，然后一次性执行任意个工具。
4. 思考内容应该包含对于所提供的所有的skill的思考，考虑将它们用于本次任务。
5. 思考内容严格以“我们来看看到目标状态的距离”开始`,
		);
	}

	return text
		.replace(/<(\w+)>/g, (_, name) => openTag(style, name))
		.replace(/<\/(\w+)>/g, (_, name) => closeTag(style, name));
}

/** 用指定风格包裹内容 */
function wrapTagByStyle(
	name: string,
	content: string,
	style: TagStyle,
): string {
	if (name === "system-hint" && style === "deepseek") {
		return `【system-hint】\n${content}\n---`;
	}
	return `${openTag(style, name)}\n${content}\n${closeTag(style, name)}`;
}

/**
 * 创建标准 TagAdapter — 基于 TagStyle 的通用实现。
 *
 * 大多数 provider（OpenAI、Anthropic、Gemini、DeepSeek）使用此工厂。
 */
export function createTagAdapter(style: TagStyle): TagAdapter {
	return {
		wrapTag: (name, content) => wrapTagByStyle(name, content, style),
		adaptTags: (text) => adaptTagsByStyle(text, style),
	};
}
