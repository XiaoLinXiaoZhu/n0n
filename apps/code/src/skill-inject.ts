/**
 * @name 解析与 skill 引用
 *
 * 识别用户输入中独占一行的 @name 语法，读取对应 skill 内容，
 * 并从可见文本中移除 @name 行。
 *
 * 不再将 skill 内容塞进 hint —— 而是作为 mentionedSkills 附在 UserInputMessage 上，
 * 承载「用户引用了这些 skill」的原本语义，由 adapter（format-prompt）负责拼装提示词。
 *
 * 按名称或别名查找，支持返回多个匹配结果。
 */

import { listSkills, readSkills, toSkill } from "@n0n/skill";
import type { Skill } from "@n0n/types";

export interface SkillInjectResult {
	/** 移除了 @name 行后的用户文本 */
	cleanedText: string;
	/** 用户引用的 skill（领域层最小表示），空数组表示无 skill 唤起 */
	mentionedSkills: Skill[];
	/** 找不到的 skill 名称列表 */
	notFound: string[];
}

/** 匹配独占一行的 @name（name 由小写字母、数字、连字符组成） */
const SKILL_LINE_RE = /^@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/;

/**
 * 解析用户输入中的 @name 引用并读取 skill 内容。
 *
 * 每个 @name 按名称或别名查找，可能匹配到多个 skill。
 *
 * @returns 清理后的文本 + 引用的 skill 列表 + 未找到列表
 */
export async function parseAndInjectSkills(
	input: string,
): Promise<SkillInjectResult> {
	const lines = input.split(/\r?\n/);
	const skillNames: string[] = [];
	const cleanedLines: string[] = [];

	for (const line of lines) {
		const match = line.trim().match(SKILL_LINE_RE);
		if (match?.[1]) {
			skillNames.push(match[1]);
		} else {
			cleanedLines.push(line);
		}
	}

	if (skillNames.length === 0) {
		return { cleanedText: input, mentionedSkills: [], notFound: [] };
	}

	const { found, notFound } = await readSkills(skillNames);

	return {
		cleanedText: cleanedLines.join("\n").trim(),
		mentionedSkills: found.map(toSkill),
		notFound,
	};
}

/**
 * 列出可用 skill 名称和别名（用于提示用户）
 */
export async function getAvailableSkillNames(): Promise<string[]> {
	const skills = await listSkills();
	const names: string[] = [];
	for (const s of skills) {
		names.push(s.name);
		names.push(...s.alias);
	}
	return [...new Set(names)];
}
