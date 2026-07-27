/**
 * Skill 扫描器 — 按目录结构发现所有 SKILL.md
 *
 * 职责：
 * - 扫描单个分类目录下的 skill
 * - 扫描单个根目录（四个分类子目录自动遍历）
 * - 扫描多个根目录（合并全部结果）
 *
 * 不负责解析 frontmatter 或加载内容，只返回元数据列表。
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { Glob } from "bun";
import { parseSkillMeta } from "./parser.ts";
import type { SkillCategory, SkillMeta } from "./types.ts";

/** 有效的分类目录名 */
export const CATEGORIES: readonly SkillCategory[] = [
	"capability",
	"directive",
	"self-function",
	"task",
] as const;

function _isCategory(s: string): s is SkillCategory {
	return (CATEGORIES as readonly string[]).includes(s);
}

/**
 * 扫描单个分类目录下的所有 skill
 *
 * @param categoryDir 分类目录的绝对路径（如 ~/.n0n/builtin-skills/self-function/）
 * @param category 分类名称
 */
async function discoverSkillsInCategory(
	categoryDir: string,
	category: SkillCategory,
): Promise<SkillMeta[]> {
	if (!existsSync(categoryDir)) return [];

	const glob = new Glob("**/SKILL.md");
	const files = Array.from(glob.scanSync({ cwd: categoryDir }));

	const skills: SkillMeta[] = [];

	for (const rel of files) {
		const absPath = resolve(categoryDir, rel);
		try {
			const content = await Bun.file(absPath).text();
			const meta = parseSkillMeta(content, absPath, categoryDir, category);
			if (meta) skills.push(meta);
		} catch {
			// 读取/解析失败，静默跳过
		}
	}

	return skills;
}

/**
 * 扫描一个根目录下的所有分类子目录
 *
 * @param baseDir 根目录（如 ~/.n0n/builtin-skills/）
 */
export async function discoverSkills(baseDir: string): Promise<SkillMeta[]> {
	const absBase = resolve(baseDir);
	if (!existsSync(absBase)) return [];

	const skills: SkillMeta[] = [];

	for (const cat of CATEGORIES) {
		const catDir = resolve(absBase, cat);
		const catSkills = await discoverSkillsInCategory(catDir, cat);
		skills.push(...catSkills);
	}

	return skills;
}

/**
 * 扫描多个根目录，收集所有 skill（不覆盖，保留全部）
 *
 * 当同名 skill 出现在多个根目录时，每个都被保留（去重由调用方决定）。
 */
export async function discoverSkillsMultiDir(
	baseDirs: string[],
): Promise<SkillMeta[]> {
	const all: SkillMeta[] = [];

	for (const baseDir of baseDirs) {
		const skills = await discoverSkills(baseDir);
		all.push(...skills);
	}

	return all;
}
