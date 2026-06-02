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
 * 标签命名：以 skill 名本身作为标签名（无属性），由 wrapTag 按 client 风格渲染，
 * 因此 skill 标签随 provider 风格走（XML / deepseek `## name` / minimax 等）。
 * scripts / resources 同样用 wrapTag 包裹为子标签，嵌入 skill 标签内部。
 */

import type { Skill, TagAdapter } from "@n0n/types";

/** skill 块内顶部的标记行，标识该控制块是一个 skill */
const SKILL_MARKER = "%% This is a skill %%";

/** 单个 skill → 控制块：wrapTag(skillName, marker + body + 可选 scripts/resources) */
function formatOneSkill(skill: Skill, tags: TagAdapter): string {
	const inner: string[] = [SKILL_MARKER, "", skill.body];

	if (skill.scripts.length > 0) {
		inner.push("", tags.wrapTag("scripts", skill.scripts.join("\n")));
	}
	if (skill.resources.length > 0) {
		inner.push("", tags.wrapTag("resources", skill.resources.join("\n")));
	}

	return tags.wrapTag(skill.name, inner.join("\n"));
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
