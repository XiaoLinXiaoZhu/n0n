/**
 * Frontmatter 解析与元数据提取
 *
 * 职责：
 * - YAML frontmatter 解析（委托 @n0n/shared 的通用解析器）
 * - SKILL.md 专属的 Zod schema 定义
 * - name 从目录路径自动推导
 * - uid 自动生成
 * - alias 字段规范化
 */

import { relative, resolve, sep } from "node:path";
import {
	extractNestedBlock,
	extractRawYaml,
	parseFrontmatter as parseFM,
} from "@n0n/shared";
import { z } from "zod";
import type { SkillCategory, SkillMeta } from "./types.ts";

// ── UID 生成 ──

let uidCounter = 0;

/** 生成全局唯一的 skill 标识符 */
export function generateUid(): string {
	const ts = Date.now().toString(36);
	const counter = (uidCounter++).toString(36).padStart(4, "0");
	const rand = Math.random().toString(36).slice(2, 6);
	return `${ts}-${counter}-${rand}`;
}

// ── Zod Schemas ──

/** alias 字段支持 string | string[] */
const AliasSchema = z
	.union([z.string(), z.array(z.string())])
	.optional()
	.default([])
	.transform((v) => {
		if (typeof v === "string") return [v];
		return v;
	});

/** SKILL.md 的 frontmatter schema */
export const SkillFrontmatterSchema = z.object({
	alias: AliasSchema,
	description: z.string(),
	license: z.string().optional(),
	compatibility: z.string().optional(),
	activation: z.enum(["auto", "manual", "init"]).default("auto"),
	order: z.coerce.number().int().default(50),
});

/** 解析后的 frontmatter 数据类型 */
export type SkillFrontmatterData = z.infer<typeof SkillFrontmatterSchema>;

// ── Name 推导 ──

/**
 * 从 SKILL.md 所在目录相对于分类根目录的路径生成 name
 *
 * 例：categoryDir = /skills/task, skillPath = /skills/task/review/init/SKILL.md
 * → 相对路径 = review/init → name = review-init
 *
 * 例：categoryDir = /skills/standard, skillPath = /skills/standard/coding/SKILL.md
 * → 相对路径 = coding → name = coding
 */
export function deriveNameFromPath(
	skillPath: string,
	categoryDir: string,
): string {
	const skillDir = resolve(skillPath, "..");
	const rel = relative(categoryDir, skillDir);
	return rel.split(sep).join("-").replace(/\\/g, "-");
}

// ── 元数据解析 ──

/**
 * 解析 YAML frontmatter，提取 skill 元数据
 */
export function parseSkillMeta(
	content: string,
	filePath: string,
	categoryDir: string,
	category: SkillCategory,
): SkillMeta | null {
	const result = parseFM(content, SkillFrontmatterSchema);
	if (!result) return null;

	const { data } = result;
	const rawYaml = extractRawYaml(content);

	const dir = resolve(filePath, "..");
	const name = deriveNameFromPath(filePath, categoryDir);

	if (!name) {
		console.error(`  [skills] 无法从路径推导 name: ${filePath}, skipping`);
		return null;
	}

	const meta: SkillMeta = {
		uid: generateUid(),
		name,
		alias: data.alias,
		category,
		description: data.description,
		path: resolve(filePath),
		dir,
		activation: data.activation,
		order: data.order,
	};

	if (data.license) meta.license = data.license;
	if (data.compatibility) meta.compatibility = data.compatibility;

	if (rawYaml) {
		const metadataRaw = extractNestedBlock(rawYaml, "metadata");
		if (metadataRaw && Object.keys(metadataRaw).length > 0) {
			meta.metadata = metadataRaw;
		}
	}

	return meta;
}
