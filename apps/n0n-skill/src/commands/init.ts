/**
 * init 命令：将 data/skills/ 中的 skill 按四个分类子目录写入 ~/.n0n/builtin-skills/
 *
 * 源目录结构：data/skills/{capability,directive,standard,task}/
 * 目标结构：~/.n0n/builtin-skills/{capability,directive,standard,task}/
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { Glob } from "bun";
import { getBuiltinSkillsDir } from "../paths.ts";

/** skill 源目录：项目根 data/skills/ */
const BUILTIN_SOURCE = resolve(import.meta.dir, "../../../../data/skills");

/** 四个分类子目录 */
const CATEGORIES = ["capability", "directive", "standard", "task"] as const;

export async function initCommand(): Promise<void> {
	const targetDir = getBuiltinSkillsDir();

	if (!existsSync(BUILTIN_SOURCE)) {
		console.error("内置 skill 源目录不存在。安装可能不完整。");
		process.exit(1);
	}

	// 清除旧内容，避免残留已删除的 skill
	if (existsSync(targetDir)) {
		rmSync(targetDir, { recursive: true });
	}

	let count = 0;

	for (const category of CATEGORIES) {
		const srcCatDir = resolve(BUILTIN_SOURCE, category);
		if (!existsSync(srcCatDir)) continue;

		const destCatDir = resolve(targetDir, category);

		// 扫描该分类下所有 SKILL.md，按其所在目录树完整复制
		const glob = new Glob("**/SKILL.md");
		const skillFiles = Array.from(glob.scanSync({ cwd: srcCatDir }));

		for (const rel of skillFiles) {
			const skillDir = resolve(srcCatDir, rel, "..");
			// 计算 skill 目录相对于分类目录的路径，保持嵌套结构
			const relSkillDir = skillDir.slice(srcCatDir.length + 1);
			const destDir = resolve(destCatDir, relSkillDir);

			await copyDir(skillDir, destDir);
			count++;
		}
	}

	console.log(`✓ 已初始化 ${count} 个内置 skill 到 ${targetDir}`);
}

async function copyDir(src: string, dest: string): Promise<void> {
	if (!existsSync(dest)) mkdirSync(dest, { recursive: true });

	const glob = new Glob("**/*");
	for (const rel of glob.scanSync({ cwd: src })) {
		const srcPath = resolve(src, rel);
		const destPath = resolve(dest, rel);
		const file = Bun.file(srcPath);
		const stat = await file.exists();
		if (!stat) continue;

		const destParent = resolve(destPath, "..");
		if (!existsSync(destParent)) mkdirSync(destParent, { recursive: true });

		await Bun.write(destPath, file);
	}
}
