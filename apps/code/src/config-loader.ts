/**
 * ConfigLoader — 配置加载与显示
 *
 * 负责：
 * 1. TOML 配置加载（默认 → 全局 → 项目，后者覆盖前者）
 * 2. .env 文件解析与合并（全局 → 项目 → process.env）
 * 3. Zod schema 验证
 * 4. 配置摘要格式化与显示
 *
 * 与 index.ts 解耦——不依赖 stdin、REPL 或任何组件构造逻辑。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { style, writeln } from "@n0n/cli-ui";
import { type ConfigSource, getConfig } from "@n0n/config";
import { ProviderConfigSchema } from "@n0n/llm";
import { z } from "zod";
import { UserInputConfigSchema } from "./multiline-input/config.ts";

// ── Schema ──

export const codeConfigSchema = z.object({
	settings: z.object({
		strip_hint: z.boolean().default(true),
		notify_sound: z.boolean().default(false),
		notify_sound_path: z.string().default(""),
		agent: z.object({
			max_iterations: z.number().default(50),
			max_idle_rounds: z.number().default(5),
			default_exec_waitfor: z.number().default(120),
		}),
		security: z.object({
			blocked_commands: z.array(z.string()).default([]),
		}),
		llm: ProviderConfigSchema,
		user_input: UserInputConfigSchema,
	}),
});

export type CodeSettings = z.infer<typeof codeConfigSchema>["settings"];

// ── 默认 TOML ──

export const DEFAULT_TOML = `
[settings]
strip_hint = true
notify_sound = false
notify_sound_path = ""

[settings.agent]
max_iterations = 50
max_idle_rounds = 5
default_exec_waitfor = 120

[settings.security]
blocked_commands = []

[settings.user_input]
max_width = -1
max_height = -1
align = "left"
`;

// ── 文件路径 ──

export interface ConfigPaths {
	globalConfigDir: string;
	globalTomlPath: string;
	projectTomlPath: string;
	globalEnvPath: string;
	projectEnvPath: string;
}

export function resolveConfigPaths(cwd?: string): ConfigPaths {
	const globalConfigDir = resolve(homedir(), ".n0n");
	return {
		globalConfigDir,
		globalTomlPath: resolve(globalConfigDir, "config.toml"),
		projectTomlPath: resolve(cwd ?? process.cwd(), ".n0n", "config.toml"),
		globalEnvPath: resolve(globalConfigDir, ".env"),
		projectEnvPath: resolve(cwd ?? process.cwd(), ".n0n", ".env"),
	};
}

// ── 配置加载结果 ──

export interface LoadedConfig {
	settings: CodeSettings;
	/** 配置项来源追踪，key 为 "settings.llm.api_key" 格式 */
	trace: Record<string, { source: string }>;
	paths: ConfigPaths;
}

export interface ConfigLoadError {
	kind: string;
	message: string;
}

export type ConfigLoadResult =
	| { success: true; config: LoadedConfig }
	| { success: false; errors: ConfigLoadError[]; paths: ConfigPaths };

// ── .env 解析 ──

function parseEnvFile(content: string): Record<string, string> {
	const result: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx < 0) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		const value = trimmed.slice(eqIdx + 1).trim();
		if (key) result[key] = value;
	}
	return result;
}

/** 构建 envPool（全局 .env → 项目 .env → process.env，后者覆盖前者） */
function buildEnvPool(paths: ConfigPaths): Record<string, string> {
	const envPool: Record<string, string> = {};

	if (existsSync(paths.globalEnvPath)) {
		Object.assign(
			envPool,
			parseEnvFile(readFileSync(paths.globalEnvPath, "utf-8")),
		);
	}
	if (existsSync(paths.projectEnvPath)) {
		Object.assign(
			envPool,
			parseEnvFile(readFileSync(paths.projectEnvPath, "utf-8")),
		);
	}
	for (const [k, v] of Object.entries(process.env)) {
		if (v !== undefined) envPool[k] = v;
	}

	return envPool;
}

// ── 加载入口 ──

/**
 * 加载并验证代码 agent 配置。
 *
 * 默认 → 全局 TOML → 项目 TOML 逐层覆盖，.env 变量注入，Zod 验证。
 * 返回判别联合——调用方决定如何处理失败情况。
 */
export function loadCodeConfig(paths: ConfigPaths): ConfigLoadResult {
	// 确保全局配置目录存在
	if (!existsSync(paths.globalConfigDir)) {
		mkdirSync(paths.globalConfigDir, { recursive: true });
	}

	const sources: ConfigSource[] = [{ name: "默认", content: DEFAULT_TOML }];

	if (existsSync(paths.globalTomlPath)) {
		sources.push({
			name: "全局",
			content: readFileSync(paths.globalTomlPath, "utf-8"),
		});
	}

	if (existsSync(paths.projectTomlPath)) {
		sources.push({
			name: "项目",
			content: readFileSync(paths.projectTomlPath, "utf-8"),
		});
	}

	const envPool = buildEnvPool(paths);
	const result = getConfig(codeConfigSchema, sources, envPool);

	if (!result.success) {
		return { success: false, errors: result.errors, paths };
	}

	return {
		success: true,
		config: {
			settings: result.data.settings,
			trace: result.trace,
			paths,
		},
	};
}

// ── 显示 ──

function maskSecret(value: string): string {
	if (value.length <= 8) return "****";
	return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function sourceTag(source: string): string {
	switch (source) {
		case "默认":
			return style.dim("[默认]");
		case "全局":
			return style.cyan("[全局]");
		case "项目":
			return style.green("[项目]");
		case "zod default":
			return style.dim("[default]");
		default:
			return style.dim(`[${source}]`);
	}
}

function formatValue(key: string, value: unknown): string {
	if (key === "api_key" && typeof value === "string") return maskSecret(value);
	if (typeof value === "object" && value !== null) return JSON.stringify(value);
	return String(value);
}

function displayProvider(
	trace: Record<string, { source: string }>,
	label: string,
	pc: Record<string, unknown>,
	prefix: string,
): void {
	writeln(`  ${style.dim("──")} ${style.cyan(label)}`);
	for (const [key, value] of Object.entries(pc)) {
		const src = trace[`${prefix}.${key}`]?.source;
		writeln(
			`    ${style.white(key)} = ${formatValue(key, value)}${src ? ` ${sourceTag(src)}` : ""}`,
		);
	}
}

/**
 * 在终端显示配置摘要（来源 + 当前值）。
 * 与加载逻辑分离——可在启动时调用，也可通过 debug 命令独立触发。
 */
export function displayCodeConfig(config: LoadedConfig): void {
	const { settings, trace, paths } = config;
	const { llm } = settings;

	// 配置来源
	writeln(`${style.cyan("i")} ${style.bold("配置来源:")}`);
	writeln();
	writeln(
		`  ${style.gray("全局 env:")}  ${style.white(paths.globalEnvPath)}${existsSync(paths.globalEnvPath) ? ` ${style.green("✓")}` : ` ${style.dim("(不存在)")}`}`,
	);
	writeln(
		`  ${style.gray("项目 env:")}  ${style.white(paths.projectEnvPath)}${existsSync(paths.projectEnvPath) ? ` ${style.green("✓")}` : ` ${style.dim("(不存在)")}`}`,
	);
	writeln(
		`  ${style.gray("全局 TOML:")} ${style.white(paths.globalTomlPath)}${existsSync(paths.globalTomlPath) ? ` ${style.green("✓")}` : ` ${style.dim("(不存在)")}`}`,
	);
	writeln(
		`  ${style.gray("项目 TOML:")} ${style.white(paths.projectTomlPath)}${existsSync(paths.projectTomlPath) ? ` ${style.green("✓")}` : ` ${style.dim("(不存在)")}`}`,
	);
	writeln();

	// LLM
	writeln(`${style.cyan("i")} ${style.bold("当前配置:")}`);
	writeln();
	displayProvider(
		trace,
		"LLM",
		llm as unknown as Record<string, unknown>,
		"settings.llm",
	);

	// 通用设置
	writeln();
	writeln(`  ${style.dim("──")} ${style.cyan("设置")}`);
	writeln(
		`    ${style.white("strip_hint")} = ${settings.strip_hint} ${sourceTag(trace["settings.strip_hint"]?.source ?? "")}`,
	);
	writeln(
		`    ${style.white("notify_sound")} = ${settings.notify_sound} ${sourceTag(trace["settings.notify_sound"]?.source ?? "")}`,
	);

	writeln();
	writeln(`${style.green("✓")} 配置加载完成`);
	writeln();
}
