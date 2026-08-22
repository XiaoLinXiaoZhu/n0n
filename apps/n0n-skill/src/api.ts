/**
 * n0n-skill 编程接口
 *
 * 供 apps/code 等消费者直接调用（不走 CLI），确保行为一致。
 */

import type { Skill, SkillContent, SkillMeta } from "@n0n/skills";
import {
	discoverSkillsMultiDir,
	findSkillsByNameOrAlias,
	loadSkillContentWithMeta,
	toSkill,
} from "@n0n/skills";
import { getSkillDirs } from "./paths.ts";

export type { Skill, SkillContent, SkillMeta };
export { toSkill };

/** 获取所有 skill 元数据 */
export async function listSkills(): Promise<SkillMeta[]> {
	return discoverSkillsMultiDir(getSkillDirs());
}

/**
 * 按名称或别名读取 skill 完整内容（支持返回多个匹配结果）
 *
 * 当 query 匹配多个 skill 的 name 或 alias 时，返回所有匹配项。
 */
export async function readSkill(query: string): Promise<SkillContent[]> {
	const skills = await discoverSkillsMultiDir(getSkillDirs());
	const matched = findSkillsByNameOrAlias(skills, query);
	if (matched.length === 0) return [];

	const results: SkillContent[] = [];
	for (const skill of matched) {
		const r = await loadSkillContentWithMeta(skill);
		if (r.ok) results.push(r.skill);
	}
	return results;
}

/**
 * 批量读取多个 skill 的完整内容（按名称或别名查找，每个 query 可能匹配多个）
 */
export async function readSkills(
	names: string[],
): Promise<{ found: SkillContent[]; notFound: string[] }> {
	const skills = await discoverSkillsMultiDir(getSkillDirs());
	const found: SkillContent[] = [];
	const notFound: string[] = [];

	for (const name of names) {
		const matched = findSkillsByNameOrAlias(skills, name);
		if (matched.length === 0) {
			notFound.push(name);
			continue;
		}
		for (const skill of matched) {
			const r = await loadSkillContentWithMeta(skill);
			if (r.ok) found.push(r.skill);
			else notFound.push(name);
		}
	}

	return { found, notFound };
}

/** 加载所有 init skill 的完整内容，按 order 升序排列 */
export async function loadInitSkillsFromDirs(
	skillDirs: string[],
): Promise<SkillContent[]> {
	const skills = await discoverSkillsMultiDir(skillDirs);
	const initSkills = skills
		.filter((s) => s.activation === "init")
		.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
	const contents: SkillContent[] = [];
	for (const skill of initSkills) {
		const r = await loadSkillContentWithMeta(skill);
		if (r.ok) contents.push(r.skill);
	}
	return contents;
}

/** 从当前安装目录加载所有 init skill */
export async function loadInitSkills(): Promise<SkillContent[]> {
	return loadInitSkillsFromDirs(getSkillDirs());
}
