/**
 * Skill 数据类型
 */

/** Skill 激活模式 */
export type SkillActivation = "auto" | "manual" | "init";

/** Skill 分类 */
export type SkillCategory = "capability" | "directive" | "standard" | "task";

/** Skill 元数据（从 SKILL.md frontmatter + 目录结构解析） */
export interface SkillMeta {
	/** 唯一标识符（自动生成，与路径和文件名无关） */
	uid: string;
	/** 名称（从相对于扫描根目录的路径自动生成，如 review-init） */
	name: string;
	/** 便捷别名（从 frontmatter 读取，用于快速键入） */
	alias: string[];
	/** 分类（从扫描根目录名推断） */
	category: SkillCategory;
	/** 描述：做什么、何时使用 */
	description: string;
	/** 激活模式：auto 出现在 help 列表，manual 需显式唤起，init 启动时自动加载 */
	activation: SkillActivation;
	/** 排序权重（仅 init skill 有意义），默认 50 */
	order: number;
	/** SKILL.md 绝对路径 */
	path: string;
	/** skill 目录绝对路径 */
	dir: string;
	/** 可选：许可证 */
	license?: string;
	/** 可选：兼容性说明 */
	compatibility?: string;
	/** 可选：额外元数据 */
	metadata?: Record<string, string>;
}

/** Skill 完整内容（元数据 + 指令正文） */
export interface SkillContent extends SkillMeta {
	/** SKILL.md 的 Markdown 正文（frontmatter 之后的部分） */
	body: string;
	/** skill 目录下的脚本文件列表（相对路径） */
	scripts: string[];
}
