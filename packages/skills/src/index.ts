/**
 * @n0n/skills — Skill 发现、解析与加载
 *
 * 分层架构：
 * - types：纯类型定义，无运行时依赖
 * - parser：frontmatter 解析、name 推导、uid 生成
 * - scanner：目录扫描，返回 SkillMeta[]
 * - resolver：按名称/别名查找
 * - loader：加载 SkillMeta → SkillContent（含正文和脚本）
 * - formatter：将元数据/内容转为 LLM 可读文本
 *
 * 此文件为便捷入口，汇聚所有公开 API。
 * 消费者也可按需导入子模块以避免冗余加载。
 */

export { discoverSkills, discoverSkillsMultiDir } from "./scanner.ts";
export { findSkillsByNameOrAlias } from "./resolver.ts";
export {
  formatSkillContents,
  formatSkillSummaries,
} from "./formatter.ts";
export {
  loadSkillContent,
  loadSkillContentWithMeta,
  loadSkillContents,
} from "./loader.ts";
export { parseSkillMeta, deriveNameFromPath, generateUid } from "./parser.ts";
export type {
  SkillActivation,
  SkillCategory,
  SkillContent,
  SkillMeta,
} from "./types.ts";
