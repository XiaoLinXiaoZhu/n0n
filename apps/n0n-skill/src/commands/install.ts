/**
 * install 命令：安装远程 skill
 *
 * 暂时只支持本地路径安装（复制到 ~/.n0n/skills/）。
 * 远程 git URL 支持作为后续迭代。
 */

import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { Glob } from "bun";
import { getUserSkillsDir } from "../paths.ts";

export async function installCommand(source: string): Promise<void> {
	const absSource = resolve(source);
	const skillMdPath = resolve(absSource, "SKILL.md");

	if (!existsSync(skillMdPath)) {
		throw new Error(`"${absSource}" 不是有效的 skill 目录（缺少 SKILL.md）。`);
	}

	const skillName = basename(absSource);
	const destDir = resolve(getUserSkillsDir(), skillName);

	if (!existsSync(getUserSkillsDir())) {
		mkdirSync(getUserSkillsDir(), { recursive: true });
	}

	// 复制 skill 目录
	if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
	const glob = new Glob("**/*");
	for (const rel of glob.scanSync({ cwd: absSource })) {
		const srcPath = resolve(absSource, rel);
		const destPath = resolve(destDir, rel);
		const destParent = resolve(destPath, "..");
		if (!existsSync(destParent)) mkdirSync(destParent, { recursive: true });
		await Bun.write(destPath, Bun.file(srcPath));
	}

	console.log(`✓ 已安装 skill "${skillName}" 到 ${destDir}`);
}
