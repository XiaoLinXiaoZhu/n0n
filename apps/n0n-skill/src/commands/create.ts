/**
 * create 命令：创建新 skill 脚手架
 *
 * 在 ~/.n0n/skills/<category>/<name>/ 下生成 SKILL.md 模板。
 * name 从目录路径自动推导，frontmatter 只含 alias（可选）和其他元数据。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { SKILL_CATEGORIES, type SkillCategory } from "@n0n/skills";
import { getUserSkillsDir } from "../paths.ts";

export interface SkillLocation {
	category: SkillCategory;
	nameParts: readonly [string, ...string[]];
}

const SKILL_TEMPLATE = (displayName: string) => `---
description: TODO - 描述此 skill 的用途和触发条件
activation: auto
---

# ${displayName}

TODO - 在此编写方法论指令。
`;

export function parseSkillLocation(input: string): SkillLocation {
	const parts = input.split("/");
	if (parts.length < 2) {
		throw new Error("格式错误。请使用 <category>/<name>，如 task/my-skill");
	}

	const category = parts[0] ?? "";
	if (!isSkillCategory(category)) {
		throw new Error(
			`无效的分类 "${category}"。可用: ${SKILL_CATEGORIES.join(", ")}`,
		);
	}

	const nameParts = parts.slice(1);
	for (const part of nameParts) {
		if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(part) || part.includes("--")) {
			throw new Error(
				`无效的名称段 "${part}"。必须是小写字母、数字和连字符，不能包含连续连字符。`,
			);
		}
	}

	const [firstNamePart, ...remainingNameParts] = nameParts;
	if (firstNamePart === undefined) {
		throw new Error("格式错误。请使用 <category>/<name>，如 task/my-skill");
	}
	const parsedNameParts: readonly [string, ...string[]] = [
		firstNamePart,
		...remainingNameParts,
	];
	return {
		category,
		nameParts: parsedNameParts,
	};
}

export async function createCommand(location: SkillLocation): Promise<void> {
	const dirName = location.nameParts.join("/");
	const displayName = location.nameParts.join("-");
	const skillDir = resolve(getUserSkillsDir(), location.category, dirName);

	if (existsSync(skillDir)) {
		throw new Error(`skill 目录已存在: ${skillDir}`);
	}

	mkdirSync(skillDir, { recursive: true });
	writeFileSync(
		resolve(skillDir, "SKILL.md"),
		SKILL_TEMPLATE(displayName),
		"utf-8",
	);

	console.log(`✓ 已创建 skill 脚手架: ${skillDir}`);
	console.log(`  name 将自动推导为: ${displayName}`);
	console.log("  编辑 SKILL.md 添加方法论内容。");
}

function isSkillCategory(category: string): category is SkillCategory {
	return SKILL_CATEGORIES.some((candidate) => candidate === category);
}
