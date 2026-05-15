/**
 * Skill 查找器 — 按名称或别名匹配
 *
 * 职责：
 * - 名称精确匹配
 * - 别名精确匹配
 * - 支持返回多个匹配结果（同名、别名冲突、名-别互撞）
 */
import type { SkillMeta } from "./types.ts";

/**
 * 按名称或别名查找 skill（支持返回多个匹配结果）
 *
 * 当出现以下情况时会返回多个匹配：
 * - 多个 skill 同名（不同分类目录下的同名目录）
 * - 多个 skill 共享同一个别名
 * - 一个 skill 的名称恰好是另一个 skill 的别名
 */
export function findSkillsByNameOrAlias(
  skills: SkillMeta[],
  query: string,
): SkillMeta[] {
  return skills.filter(
    (s) => s.name === query || s.alias.includes(query),
  );
}
