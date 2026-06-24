/**
 * format-skill — Skill[] → 提示词文本
 *
 * 将一组排序好的 Skill 拼装为提示词片段。
 *
 * 标签处理：全程使用 TagAdapter.wrapTag 做**精细包裹**，不使用 adaptTags。
 * 原因：skill 的 body 是 SKILL.md 任意正文，可能包含 XML/HTML 片段；
 * adaptTags 会用正则扫描全文改写所有 `<tag>`，会误伤 body 内的内容标签。
 * wrapTag 只生成指定的控制标签，content 内部原样保留，body 绝不被触碰。
 *
 * 标签命名：外层统一使用 `<skill name="xxx">` 标签（tag name 固定为 "skill"，
 * skill 名称通过 name 属性传递）。scripts / resources 同样用 wrapTag 包裹为子标签。
 */

import type { Skill, TagAdapter } from "@n0n/types";

/** 单个 skill → 控制块：<skill name="xxx"> marker + body + 可选子标签 + 结束注释 */
function formatOneSkill(skill: Skill, tags: TagAdapter): string {
	const scriptsBlock =
		skill.scripts.length > 0
			? `\n\n${tags.wrapTag("scripts", skill.scripts.join("\n"))}`
			: "";
	const resourcesBlock =
		skill.resources.length > 0
			? `\n\n${tags.wrapTag("resources", skill.resources.join("\n"))}`
			: "";

	const body = `<!-- begin of skill ${skill.name} -->\n\n${skill.body}${scriptsBlock}${resourcesBlock}\n\n<!-- end of skill ${skill.name} -->`;

	return tags.wrapTag("skill", body, { name: skill.name });
}

/**
 * 将一组 skill 拼装为提示词文本。
 *
 * @param skills 已按期望顺序排好的 skill 列表
 * @param tags client 注入的 TagAdapter，用于按 provider 风格包裹控制标签
 * @returns 拼接好的 skill 文本；skills 为空时返回空字符串
 */
export function formatSkills(skills: Skill[], tags: TagAdapter): string {
	if (skills.length === 0) return "";
	return skills.map((s) => formatOneSkill(s, tags)).join("\n\n");
}
