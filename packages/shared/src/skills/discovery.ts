/**
 * Skill 发现与解析 — Agent Skills 标准格式
 *
 * 按四个分类子目录（capability/directive/standard/task）扫描 SKILL.md，
 * 从相对路径自动生成 name，从 frontmatter 读取 alias 和其他元数据。
 */

import { existsSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { Glob } from "bun";
import { z } from "zod";
import {
	extractNestedBlock,
	extractRawYaml,
	parseFrontmatter as parseFM,
} from "../frontmatter.ts";
import type {
	SkillCategory,
	SkillContent,
	SkillMeta,
} from "./types.ts";

export type { SkillContent, SkillMeta, SkillActivation, SkillCategory } from "./types.ts";

/** 有效的分类目录名 */
const CATEGORIES: readonly SkillCategory[] = [
	"capability",
	"directive",
	"standard",
	"task",
] as const;

function isCategory(s: string): s is SkillCategory {
	return (CATEGORIES as readonly string[]).includes(s);
}

// ── UID 生成 ──

let uidCounter = 0;
function generateUid(): string {
	const ts = Date.now().toString(36);
	const counter = (uidCounter++).toString(36).padStart(4, "0");
	const rand = Math.random().toString(36).slice(2, 6);
	return `${ts}-${counter}-${rand}`;
}

// ── 扫描单个分类目录 ──

/**
 * 扫描单个分类目录下的所有 skill
 *
 * @param categoryDir 分类目录的绝对路径（如 ~/.n0n/builtin-skills/task/）
 * @param category 分类名称
 */
async function discoverSkillsInCategory(
	categoryDir: string,
	category: SkillCategory,
): Promise<SkillMeta[]> {
	if (!existsSync(categoryDir)) return [];

	const glob = new Glob("**/SKILL.md");
	const files = Array.from(glob.scanSync({ cwd: categoryDir }));

	const skills: SkillMeta[] = [];

	for (const rel of files) {
		const absPath = resolve(categoryDir, rel);
		try {
			const content = await Bun.file(absPath).text();
			const meta = parseSkillMeta(content, absPath, categoryDir, category);
			if (meta) skills.push(meta);
		} catch {
			// 读取/解析失败，静默跳过
		}
	}

	return skills;
}

/**
 * 扫描一个根目录下的所有分类子目录
 *
 * @param baseDir 根目录（如 ~/.n0n/builtin-skills/）
 */
export async function discoverSkills(baseDir: string): Promise<SkillMeta[]> {
	const absBase = resolve(baseDir);
	if (!existsSync(absBase)) return [];

	const skills: SkillMeta[] = [];

	for (const cat of CATEGORIES) {
		const catDir = resolve(absBase, cat);
		const catSkills = await discoverSkillsInCategory(catDir, cat);
		skills.push(...catSkills);
	}

	return skills;
}

/**
 * 扫描多个根目录，收集所有 skill（不覆盖，保留全部）
 */
export async function discoverSkillsMultiDir(
	baseDirs: string[],
): Promise<SkillMeta[]> {
	const all: SkillMeta[] = [];

	for (const baseDir of baseDirs) {
		const skills = await discoverSkills(baseDir);
		all.push(...skills);
	}

	return all;
}

/**
 * 按名称或别名查找 skill（支持返回多个匹配结果）
 */
export function findSkillsByNameOrAlias(
	skills: SkillMeta[],
	query: string,
): SkillMeta[] {
	return skills.filter(
		(s) => s.name === query || s.alias.includes(query),
	);
}

/**
 * 加载 skill 完整内容：元数据 + 指令正文 + 脚本列表
 */
export async function loadSkillContent(
	skillPath: string,
): Promise<SkillContent | null> {
	try {
		const content = await Bun.file(skillPath).text();
		// 加载时不需要 category/name 推导，直接解析 frontmatter body
		const fmResult = parseFM(content);
		const { body } = fmResult;

		// 从已保存的元数据中获取信息（调用方应已持有 SkillMeta）
		const dir = resolve(skillPath, "..");

		// 扫描 scripts/ 目录
		const scriptsDir = resolve(dir, "scripts");
		const scripts: string[] = [];
		if (existsSync(scriptsDir)) {
			const scriptGlob = new Glob("**/*.{ts,js,sh}");
			for (const s of scriptGlob.scanSync({ cwd: scriptsDir })) {
				scripts.push(`scripts/${s.replace(/\\/g, "/")}`);
			}
		}

		// 为 loadSkillContent 独立使用场景提供 fallback 元数据
		const meta: Omit<SkillMeta, "body" | "scripts"> = {
			uid: generateUid(),
			name: "",
			alias: [],
			category: "task",
			description: "",
			activation: "auto",
			order: 50,
			path: resolve(skillPath),
			dir,
		};

		return { ...meta, body, scripts };
	} catch {
		return null;
	}
}

/**
 * 加载已知元数据的 skill 完整内容
 */
export async function loadSkillContentWithMeta(
	skill: SkillMeta,
): Promise<SkillContent | null> {
	try {
		const content = await Bun.file(skill.path).text();
		const { body } = parseFM(content);

		const scriptsDir = resolve(skill.dir, "scripts");
		const scripts: string[] = [];
		if (existsSync(scriptsDir)) {
			const scriptGlob = new Glob("**/*.{ts,js,sh}");
			for (const s of scriptGlob.scanSync({ cwd: scriptsDir })) {
				scripts.push(`scripts/${s.replace(/\\/g, "/")}`);
			}
		}

		return { ...skill, body, scripts };
	} catch {
		return null;
	}
}

/**
 * 批量加载多个 skill 的完整内容
 */
export async function loadSkillContents(
	skills: SkillMeta[],
): Promise<SkillContent[]> {
	const results = await Promise.all(
		skills.map((s) => loadSkillContentWithMeta(s)),
	);
	return results.filter((r): r is SkillContent => r !== null);
}

/**
 * 生成 skill 摘要列表（用于注入 LLM context，每个 ~50-100 tokens）
 */
export function formatSkillSummaries(skills: SkillMeta[]): string {
	if (skills.length === 0) return "";

	return skills
		.map((s) => {
			const aliasStr = s.alias.length > 0 ? ` (alias: ${s.alias.join(", ")})` : "";
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

// ── 内部解析函数 ──

/** alias 字段支持 string | string[] */
const AliasSchema = z.union([
	z.string(),
	z.array(z.string()),
]).optional().default([]).transform((v) => {
	if (typeof v === "string") return [v];
	return v;
});

/** Skill frontmatter 的 Zod schema */
const SkillFrontmatterSchema = z.object({
	alias: AliasSchema,
	description: z.string(),
	license: z.string().optional(),
	compatibility: z.string().optional(),
	activation: z.enum(["auto", "manual", "init"]).default("auto"),
	order: z.coerce.number().int().default(50),
});

/**
 * 从 SKILL.md 所在目录相对于分类根目录的路径生成 name
 *
 * 例：categoryDir = /skills/task, skillPath = /skills/task/review/init/SKILL.md
 * → 相对路径 = review/init → name = review-init
 *
 * 例：categoryDir = /skills/standard, skillPath = /skills/standard/coding/SKILL.md
 * → 相对路径 = coding → name = coding
 */
function deriveNameFromPath(skillPath: string, categoryDir: string): string {
	const skillDir = resolve(skillPath, "..");
	const rel = relative(categoryDir, skillDir);
	// 将路径分隔符替换为连字符
	return rel.split(sep).join("-").replace(/\\/g, "-");
}

/**
 * 解析 YAML frontmatter，提取 skill 元数据
 */
function parseSkillMeta(
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
