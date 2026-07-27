/**
 * create 命令：创建新 skill 脚手架
 *
 * 在 ~/.n0n/skills/<category>/<name>/ 下生成 SKILL.md 模板。
 * name 从目录路径自动推导，frontmatter 只含 alias（可选）和其他元数据。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { getUserSkillsDir } from "../paths.ts";

const VALID_CATEGORIES = [
	"capability",
	"directive",
	"self-function",
	"task",
] as const;

const SKILL_TEMPLATE = (displayName: string) => `---
description: TODO - 描述此 skill 的用途和触发条件
activation: auto
---

# ${displayName}

TODO - 在此编写方法论指令。
`;

export async function createCommand(input: string | undefined): Promise<void> {
	if (!input) {
		console.error("用法: n0n-skill create <category>/<name>");
		console.error("  category: capability, directive, self-function, task");
		console.error("  name: 小写字母、数字和连字符");
		console.error("  示例: n0n-skill create task/my-skill");
		process.exit(1);
	}

	const parts = input.split("/");
	if (parts.length < 2) {
		console.error("格式错误。请使用 <category>/<name>，如 task/my-skill");
		process.exit(1);
	}

	const category = parts[0] ?? "";
	const nameParts = parts.slice(1);
	const dirName = nameParts.join("/");

	if (!(VALID_CATEGORIES as readonly string[]).includes(category)) {
		console.error(
			`无效的分类 "${category}"。可用: ${VALID_CATEGORIES.join(", ")}`,
		);
		process.exit(1);
	}

	// 验证每个路径段
	for (const part of nameParts) {
		if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(part) || part.includes("--")) {
			console.error(
				`无效的名称段 "${part}"。必须是小写字母、数字和连字符，不能包含连续连字符。`,
			);
			process.exit(1);
		}
	}

	const skillDir = resolve(getUserSkillsDir(), category, dirName);

	if (existsSync(skillDir)) {
		console.error(`skill 目录已存在: ${skillDir}`);
		process.exit(1);
	}

	// name 将从路径自动推导（如 task/review/init → review-init）
	const displayName = nameParts.join("-");

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
