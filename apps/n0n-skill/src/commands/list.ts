/**
 * list 命令：列出 skill
 *
 * 默认列出所有 activation=auto 的 skill。
 * --all 参数列出所有 skill（包含 auto/manual/init）。
 *
 * 输出格式：name [alias] — description
 * 末尾附标签统计（总数/auto/manual/init）。
 */

import { discoverSkillsMultiDir } from "@n0n/skills";
import type { SkillMeta } from "@n0n/skills";
import { getSkillDirs } from "../paths.ts";

export async function listCommand(rawArgs: string[]): Promise<void> {
	const showAll = rawArgs.includes("--all");
	const skills = await discoverSkillsMultiDir(getSkillDirs());

	if (skills.length === 0) {
		console.log("没有可用的 skill。运行 `n0n-skill init` 安装内置 skill。");
		return;
	}

	const filtered = showAll ? skills : skills.filter((s) => s.activation === "auto");

	if (filtered.length === 0) {
		console.log(
			showAll
				? "没有 skill。"
				: "没有 auto 类型的 skill。使用 `n0n-skill list --all` 查看全部。",
		);
		return;
	}

	// 按 category 分组输出
	const groups = groupBy(filtered, (s) => s.category);
	const sortedCats = Object.keys(groups).sort() as (keyof typeof groups)[];

	for (const cat of sortedCats) {
		console.log(`\n【${cat}】`);
		const catSkills = groups[cat]!;
		// category 内按 activation 分组
		const byActivation = groupBy(catSkills, (s) => s.activation);
		for (const actType of ["auto", "manual", "init"] as const) {
			const actSkills = byActivation[actType];
			if (!actSkills || actSkills.length === 0) continue;
			// activation 内按 name 排序
			actSkills.sort((a, b) => a.name.localeCompare(b.name));
			for (const skill of actSkills) {
				const aliasStr =
					skill.alias.length > 0
						? ` [${skill.alias.join(", ")}]`
						: "";
				const activationTag = showAll ? ` (${skill.activation})` : "";
				console.log(
					`  ${skill.name}${aliasStr}${activationTag} — ${skill.description}`,
				);
			}
		}
	}

	// 统计
	if (showAll) {
		const auto = skills.filter((s) => s.activation === "auto").length;
		const manual = skills.filter((s) => s.activation === "manual").length;
		const init = skills.filter((s) => s.activation === "init").length;
		console.log(`\n总计: ${skills.length} (auto: ${auto}, manual: ${manual}, init: ${init})`);
	} else {
		console.log(`\n总计: ${filtered.length} auto skill`);
		console.log("提示: 使用 `n0n-skill list --all` 查看全部 skill（含 auto/manual/init）。");
	}
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		(groups[key] ??= []).push(item);
	}
	return groups;
}
