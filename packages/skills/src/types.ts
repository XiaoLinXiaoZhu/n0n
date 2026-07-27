/**
 * Skill 数据类型
 *
 * 与文件系统、扫描逻辑无关的纯类型定义。
 * 可在任意上下文中安全引用（包括测试和类型转换）。
 */

import type { Skill } from "@n0n/types";

/** Skill 激活模式 */
export type SkillActivation = "auto" | "manual" | "init";

/**
 * Skill 分类 — 由父目录名推断
 *
 * - self-function: IE 驱动的核心功能文档（F0-F5），替代碎片化的 standard skill。作为 init skill 启动时自动加载。
 * - standard: 无论执行什么任务都适用的底层规则和规范。作为 init skill 启动时自动加载。（待废弃——内容已迁移到 self-function）
 * - task: 指向具体任务的完整 SOP，有步骤序列和退出条件。需 @name 触发。
 * - directive: 改变交互行为模式，不定义任务。可与其他类型堆叠。
 * - capability: 赋予使用特定工具/API/外部系统的操作能力，通常包含脚本。
 */
export type SkillCategory = "capability" | "directive" | "self-function" | "standard" | "task";

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
	/**
	 * 激活模式
	 * - auto: 出现在 help 列表，模型可自主发现和激活
	 * - manual: 对 help 隐藏，需 @name 或 read 触发
	 * - init: 启动时自动加载拼接进 system prompt，不出现在 help
	 */
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

/**
 * Skill 完整内容 = 发现层元数据（SkillMeta）+ 领域层最小接口（Skill）。
 *
 * body / scripts / resources 由顶层 Skill 提供，避免重复定义与转换逻辑：
 * SkillContent 可直接作为 Skill 使用，无需字段映射。
 */
export interface SkillContent extends SkillMeta, Skill {}

/** Skill 加载结果 — 判别联合，强制调用者处理失败 */
export type SkillLoadResult =
	| { ok: true; skill: SkillContent }
	| { ok: false; path: string; error: string };

/** 重导出 Skill，方便消费者从 @n0n/skills 同时拿到领域接口 */
export type { Skill };

/**
 * SkillContent → Skill 投影。
 *
 * SkillContent 携带 uid/category/path 等发现层元数据；领域消息
 * （SystemWithSkillMessage.skills / UserInputMessage.mentionedSkills）会被持久化，
 * 只应携带最小字段。此函数显式收窄，避免元数据污染对话日志。
 */
export function toSkill(s: SkillContent): Skill {
	return {
		name: s.name,
		body: s.body,
		scripts: s.scripts,
		resources: s.resources,
	};
}
