import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type ConfigPaths, resolveConfigPaths } from "@n0n/code/config";
import {
	loadOpenCommand,
	type OpenCommand,
	type OpenTargets,
	openPaths,
} from "./open.ts";
import type { Scope } from "./scope.ts";

export interface ConfigCommandOptions {
	scope: Scope;
	openCommand?: OpenCommand;
}

export function runConfigCommand(options: ConfigCommandOptions): void {
	const paths = resolveConfigPaths();
	mkdirSync(paths.globalConfigDir, { recursive: true });

	const localDir = resolve(process.cwd(), ".n0n");
	const localExists = existsSync(localDir);
	const targets = selectConfigTargets(options.scope, paths, localExists);

	openPaths(options.openCommand ?? loadOpenCommand(), targets);
}

export function selectConfigTargets(
	scope: Scope,
	paths: ConfigPaths,
	localExists: boolean,
): OpenTargets {
	if (scope === "local" && !localExists) {
		throw new Error(`本地配置目录不存在: ${dirname(paths.projectTomlPath)}`);
	}

	switch (scope) {
		case "global":
			return [paths.globalTomlPath, paths.globalEnvPath];
		case "local":
			return [paths.projectTomlPath, paths.projectEnvPath];
		case "all":
			return localExists
				? [
						paths.globalTomlPath,
						paths.globalEnvPath,
						paths.projectTomlPath,
						paths.projectEnvPath,
					]
				: [paths.globalTomlPath, paths.globalEnvPath];
	}
}
