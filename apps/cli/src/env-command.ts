import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
	loadOpenCommand,
	type OpenCommand,
	type OpenTargets,
	openPaths,
} from "./open.ts";
import type { Scope } from "./scope.ts";

export interface EnvCommandOptions {
	scope: Scope;
	openCommand?: OpenCommand;
}

export function runEnvCommand(options: EnvCommandOptions): void {
	const globalDir = resolve(homedir(), ".n0n");
	const localDir = resolve(process.cwd(), ".n0n");
	const localExists = existsSync(localDir);
	mkdirSync(globalDir, { recursive: true });

	const targets = selectEnvTargets(
		options.scope,
		globalDir,
		localDir,
		localExists,
	);

	openPaths(options.openCommand ?? loadOpenCommand(), targets);
}

export function selectEnvTargets(
	scope: Scope,
	globalDir: string,
	localDir: string,
	localExists: boolean,
): OpenTargets {
	if (scope === "local" && !localExists) {
		throw new Error(`本地配置目录不存在: ${localDir}`);
	}

	if (scope === "global") return [globalDir];
	if (scope === "local") return [localDir];
	return [globalDir, ...(localExists ? [localDir] : [])];
}
