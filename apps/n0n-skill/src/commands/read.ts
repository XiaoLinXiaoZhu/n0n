/**
 * read 命令：读取指定 skill 的完整内容
 *
 * 按名称或别名查找。如果匹配到多个 skill，全部输出。
 */

import {
	discoverSkillsMultiDir,
	findSkillsByNameOrAlias,
	loadSkillContentWithMeta,
} from "@n0n/skills";
import { getSkillDirs } from "../paths.ts";

export async function readCommand(name: string | undefined): Promise<void> {
	if (!name) {
		console.error("用法: n0n-skill read <name>");
		process.exit(1);
	}

	const skills = await discoverSkillsMultiDir(getSkillDirs());
	const matched = findSkillsByNameOrAlias(skills, name);

	if (matched.length === 0) {
		const available = skills.map((s) => s.name).join(", ");
		console.error(`skill "${name}" 不存在。可用: ${available || "(无)"}`);
		process.exit(1);
	}

	for (const skill of matched) {
		const content = await loadSkillContentWithMeta(skill);
		if (!content) {
			console.error(`无法加载 skill "${skill.name}" 的内容。`);
			continue;
		}

		// 多个匹配时加分隔标识
		if (matched.length > 1) {
			console.log(`\n=== ${content.name} (${content.category}) ===\n`);
		}

		// 输出完整 SKILL.md 正文
		console.log(content.body);

		// 如果有可用脚本，附加说明
		if (content.scripts.length > 0) {
			console.log(`\n可用脚本（使用 bun run ${content.dir}/<script> 执行）：`);
			for (const script of content.scripts) {
				console.log(`  - ${script}`);
			}
		}

		// 如果有额外资源文件，附加绝对路径
		if (content.resources.length > 0) {
			console.log(`\n额外资源（使用 observe 按需读取）：`);
			for (const resource of content.resources) {
				console.log(`  - ${resource}`);
			}
		}
	}
}
