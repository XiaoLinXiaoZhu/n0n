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
			(_, content) => `【system-hint】\n${content.trim()}\n---`,
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
