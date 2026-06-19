/**
 * Skill 内容加载器
 *
 * 职责：
 * - 基于 SkillMeta 加载完整内容（正文 + 脚本列表）
 * - 路径已知但元数据未知的 fallback 加载
 * - 批量加载
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseFrontmatter as parseFM } from "@n0n/shared";
import { Glob } from "bun";
import { generateUid } from "./parser.ts";
import type { SkillContent, SkillLoadResult, SkillMeta } from "./types.ts";

/**
 * 加载 skill 完整内容：元数据 + 指令正文 + 脚本列表
 *
 * 适用于仅知道路径的场景（不依赖预扫描），
 * 会生成 fallback 元数据。
 */
export async function loadSkillContent(
	skillPath: string,
): Promise<SkillLoadResult> {
	try {
		const content = await Bun.file(skillPath).text();
		const fmResult = parseFM(content);
		const { body } = fmResult;

		const dir = resolve(skillPath, "..");
		const scriptsDir = resolve(dir, "scripts");
		const scripts: string[] = [];
		if (existsSync(scriptsDir)) {
			const scriptGlob = new Glob("**/*.{ts,js,sh}");
			for (const s of scriptGlob.scanSync({ cwd: scriptsDir })) {
				scripts.push(`scripts/${s.replace(/\\/g, "/")}`);
			}
		}

		const resources: string[] = [];
		const mdGlob = new Glob("**/*.md");
		for (const m of mdGlob.scanSync({ cwd: dir })) {
			// skip SKILL.md files (they are loaded as separate skills)
			if (m.endsWith("SKILL.md")) continue;
			// skip scripts/ directory
			if (m.startsWith("scripts/") || m.startsWith("scripts\\")) continue;
			resources.push(resolve(dir, m));
		}

		const meta: Omit<SkillMeta, "body" | "scripts" | "resources"> = {
			uid: generateUid(),
			name: "",
			alias: [],
			category: "task",
			description: "",
			activation: "auto",
			order: 50,
			path: resolve(skillPath),
			dir,
		};

		return { ok: true, skill: { ...meta, body, scripts, resources } };
	} catch (err) {
		return {
			ok: false,
			path: skillPath,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * 加载已知元数据的 skill 完整内容
 *
 * 推荐用法：先用 scanner 获取 SkillMeta，再通过此函数加载正文。
 */
export async function loadSkillContentWithMeta(
	skill: SkillMeta,
): Promise<SkillLoadResult> {
	try {
		const content = await Bun.file(skill.path).text();
		const { body } = parseFM(content);

		const scriptsDir = resolve(skill.dir, "scripts");
		const scripts: string[] = [];
		if (existsSync(scriptsDir)) {
			const scriptGlob = new Glob("**/*.{ts,js,sh}");
			for (const s of scriptGlob.scanSync({ cwd: scriptsDir })) {
				scripts.push(`scripts/${s.replace(/\\/g, "/")}`);
			}
		}

		const resources: string[] = [];
		const mdGlob = new Glob("**/*.md");
		for (const m of mdGlob.scanSync({ cwd: skill.dir })) {
			// skip SKILL.md files (they are loaded as separate skills)
			if (m.endsWith("SKILL.md")) continue;
			// skip scripts/ directory
			if (m.startsWith("scripts/") || m.startsWith("scripts\\")) continue;
			resources.push(resolve(skill.dir, m));
		}

		return { ok: true, skill: { ...skill, body, scripts, resources } };
	} catch (err) {
		return {
			ok: false,
			path: skill.path,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/**
 * 批量加载多个 skill 的完整内容
 */
export async function loadSkillContents(skills: SkillMeta[]): Promise<{
	loaded: SkillContent[];
	errors: { path: string; error: string }[];
}> {
	const results = await Promise.all(
		skills.map((s) => loadSkillContentWithMeta(s)),
	);
	const loaded: SkillContent[] = [];
	const errors: { path: string; error: string }[] = [];
	for (const r of results) {
		if (r.ok) loaded.push(r.skill);
		else errors.push({ path: r.path, error: r.error });
	}
	return { loaded, errors };
}
