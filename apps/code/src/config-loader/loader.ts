/**
 * 配置加载逻辑
 *
 * 默认 → 全局 TOML → 项目 TOML 逐层覆盖，.env 变量注入，Zod 验证。
 */

import { existsSync, readFileSync } from "node:fs";
import { type ConfigSource, getConfig } from "@xlxz/config";
import { DEFAULT_TOML } from "../config-defaults.ts";
import { type ConfigPaths, ensureGlobalConfigDir } from "./paths.ts";
import { type CodeSettings, codeConfigSchema } from "./schema.ts";

// ── 加载结果类型 ──

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
	ensureGlobalConfigDir(paths);

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
