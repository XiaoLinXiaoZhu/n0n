/**
 * list 命令：列出 skill
 *
 * 默认列出所有 activation=auto 的 skill（纯文本，适合 AI 消费）。
 * --all    列出所有 skill（含 auto/manual/init）
 * --color  启用 ANSI 彩色输出（人类阅读友好）
 *
 * 输出格式：name [alias] — description
 * 末尾附标签统计。
 */

import type { Styler } from "@n0n/cli-ui";
import type { SkillMeta } from "@n0n/skills";
import { discoverSkillsMultiDir } from "@n0n/skills";
import { getSkillDirs } from "../paths.ts";

export async function listCommand(rawArgs: string[]): Promise<void> {
	const showAll = rawArgs.includes("--all");
	const useColor = rawArgs.includes("--color");

	// 动态加载 style（避免未使用时引入 picocolors）
	const c = useColor ? await loadStyler() : null;

	const skills = await discoverSkillsMultiDir(getSkillDirs());

	if (skills.length === 0) {
		console.log("没有可用的 skill。运行 `n0n-skill init` 安装内置 skill。");
		return;
	}

	const filtered = showAll
		? skills
		: skills.filter((s) => s.activation === "auto");

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
	const sortedCats = Object.keys(groups).sort();

	for (const cat of sortedCats) {
		const catLabel = c ? c.bold(c.cyan(`[${cat}]`)) : `[${cat}]`;
		console.log(`\n${catLabel}`);
		const catSkills = groups[cat];
		if (!catSkills)
			throw new Error(`unreachable: no group for category ${cat}`);
		const byActivation = groupBy(catSkills, (s) => s.activation);
		for (const actType of ["auto", "manual", "init"] as const) {
			const actSkills = byActivation[actType];
			if (!actSkills || actSkills.length === 0) continue;
			actSkills.sort((a, b) => a.name.localeCompare(b.name));
			for (const skill of actSkills) {
				const line = formatSkillLine(skill, showAll, c);
				console.log(`  ${line}`);
			}
		}
	}

	// 统计
	if (showAll) {
		const auto = skills.filter((s) => s.activation === "auto").length;
		const manual = skills.filter((s) => s.activation === "manual").length;
		const init = skills.filter((s) => s.activation === "init").length;
		const stats = c
			? `${c.bold(String(skills.length))} (auto: ${c.green(String(auto))}, manual: ${c.yellow(String(manual))}, init: ${c.gray(String(init))})`
			: `${skills.length} (auto: ${auto}, manual: ${manual}, init: ${init})`;
		console.log(`\n总计: ${stats}`);
	} else {
		const count = c ? c.bold(String(filtered.length)) : String(filtered.length);
		console.log(`\n总计: ${count} auto skill`);
		console.log(
			"提示: 使用 `n0n-skill list --all` 查看全部 skill（含 auto/manual/init）。",
		);
	}
}

function formatSkillLine(
	skill: SkillMeta,
	showAll: boolean,
	c: Styler | null,
): string {
	const nameColored = c
		? colorByActivation(skill.activation, skill.name, c)
		: skill.name;
	const aliasStr =
		skill.alias.length > 0
			? c
				? c.dim(` [${skill.alias.join(", ")}]`)
				: ` [${skill.alias.join(", ")}]`
			: "";
	const activationTag = showAll
		? c
			? c.dim(` (${skill.activation})`)
			: ` (${skill.activation})`
		: "";
	return `${nameColored}${aliasStr}${activationTag} — ${skill.description}`;
}

function colorByActivation(
	activation: string,
	text: string,
	c: Styler,
): string {
	switch (activation) {
		case "auto":
			return c.green(text);
		case "manual":
			return c.yellow(text);
		case "init":
			return c.gray(text);
		default:
			return text;
	}
}

async function loadStyler(): Promise<Styler> {
	const { style } = await import("@n0n/cli-ui");
	return style;
}

function groupBy<T>(
	items: T[],
	keyFn: (item: T) => string,
): Record<string, T[]> {
	const groups: Record<string, T[]> = {};
	for (const item of items) {
		const key = keyFn(item);
		groups[key] ??= [];
		groups[key].push(item);
	}
	return groups;
}
