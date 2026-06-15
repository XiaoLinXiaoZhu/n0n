/**
 * 配置路径解析
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

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

/** 确保全局配置目录存在 */
export function ensureGlobalConfigDir(paths: ConfigPaths): void {
	if (!existsSync(paths.globalConfigDir)) {
		mkdirSync(paths.globalConfigDir, { recursive: true });
	}
}
