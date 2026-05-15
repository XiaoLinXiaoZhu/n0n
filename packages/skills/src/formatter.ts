/**
 * Skill 格式化器 — 将元数据/内容转为 LLM 可读文本
 *
 * 职责：
 * - formatSkillSummaries：简短摘要列表（用于 help、context 注入，每条 ~50-100 tokens）
 * - formatSkillContents：完整 XML 格式（用于执行上下文注入）
 */

import type { SkillContent, SkillMeta } from "./types.ts";

/**
 * 生成 skill 摘要列表（用于注入 LLM context，每个 ~50-100 tokens）
 */
export function formatSkillSummaries(skills: SkillMeta[]): string {
  if (skills.length === 0) return "";

  return skills
    .map((s) => {
      const aliasStr =
        s.alias.length > 0 ? ` (alias: ${s.alias.join(", ")})` : "";
      return `- **${s.name}**${aliasStr}: ${s.description}${s.compatibility ? ` (${s.compatibility})` : ""}`;
    })
    .join("\n");
}

/**
 * 生成 skill 完整内容的 XML 格式（用于注入执行上下文）
 */
export function formatSkillContents(contents: SkillContent[]): string {
  if (contents.length === 0) return "";

  return contents
    .map((s) => {
      const scriptInfo =
        s.scripts.length > 0
          ? `\nAvailable scripts (run with \`bun run ${s.dir}/<script>\`):\n${s.scripts.map((p) => `  - ${p}`).join("\n")}`
          : "";

      return [
        `<skill name="${s.name}" path="${s.dir}">`,
        s.body,
        scriptInfo,
        "</skill>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");
}
