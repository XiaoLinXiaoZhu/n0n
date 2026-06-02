/**
 * 用户侧消息类型
 *
 * 约定：generic_* 系列是「不经过组织」的 pass-through 消息——
 * adapter 原样透传其单一 content 字段，不做拼装/包裹/变体处理。
 * 需要 adapter 参与组织的消息（拼接 skill、context、hint 等）使用专门的 type。
 */

import type { Skill } from "../skill.ts";

// ── 通用系统消息（pass-through） ──
export interface GenericSystemMessage {
	type: "system";
	content: string;
}

// ── 系统提示词 + Skill（需 adapter 组织） ──
/**
 * 主系统提示词 + 一组排序好的 skill。
 *
 * content 为主提示词，skills 为已按期望顺序排好的 skill 列表。
 * adapter（format-prompt）负责将 skills 拼接到 content 之后，
 * 各 client 通过注入的 TagAdapter 控制 skill 包裹标签的风格。
 *
 * 这是 skill 驱动提示词体系的注入点：系统提示词与用户/模型触发的 skill
 * 共用同一种拼装格式，形成统一的心智模型。
 */
export interface SystemWithSkillMessage {
	type: "system_with_skill";
	content: string;
	skills: Skill[];
}

// ── 通用用户文本消息（pass-through） ──
export interface GenericUserTextMessage {
	type: "generic_user_text";
	content: string;
}

/** 真实用户输入（交互模式），adapter 负责包装为设计线索并拼接上下文 */
export interface UserInputMessage {
	type: "user_input";
	content: string;
	context: string | null;
	/** 注入到用户消息末尾的行为引导提示，各 app 自行定义。null 时 adapter 不追加额外提示。 */
	hint: string | null;
	/**
	 * 用户在本次输入中提及/引用的 skill（如 @name 语法）。
	 *
	 * 与 hint 的区别：hint 是功能角度的字段（系统想让模型怎么做），
	 * mentionedSkills 是语义角度的字段（实际发生了什么——用户引用了这些 skill）。
	 * 消息承载原本含义，adapter 负责将其拼装为提示词。空数组表示未提及任何 skill。
	 */
	mentionedSkills: Skill[];
}

export interface UserImageMessage {
	type: "user_image";
	text: string;
	imagePath: string;
	focusX: number;
	focusY: number;
	scale: number;
}
