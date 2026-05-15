/**
 * init 命令：将 data/skills/ 中的 skill 写入 ~/.n0n/builtin-skills/
 */

import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve, basename } from "node:path";
import { Glob } from "bun";
import { getBuiltinSkillsDir } from "../paths.ts";

/** skill 源目录：项目根 data/skills/ */
const BUILTIN_SOURCE = resolve(import.meta.dir, "../../../../data/skills");

export async function initCommand(): Promise<void> {
	const targetDir = getBuiltinSkillsDir();

	if (!existsSync(BUILTIN_SOURCE)) {
		console.error("内置 skill 源目录不存在。安装可能不完整。");
		process.exit(1);
	}

	// 扫描所有 SKILL.md（支持嵌套目录）
	const glob = new Glob("**/SKILL.md");
	const skillFiles = Array.from(glob.scanSync({ cwd: BUILTIN_SOURCE }));

	if (skillFiles.length === 0) {
		console.log("没有找到内置 skill。");
		return;
	}

	// 清除旧内容，避免残留已删除的 skill
	if (existsSync(targetDir)) {
		rmSync(targetDir, { recursive: true });
	}

	let count = 0;
	for (const rel of skillFiles) {
		const skillDir = resolve(BUILTIN_SOURCE, rel, "..");
		const skillName = basename(skillDir);
		const destDir = resolve(targetDir, skillName);

		await copyDir(skillDir, destDir);
		count++;
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
