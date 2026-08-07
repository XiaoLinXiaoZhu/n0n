import { spawnSync } from "node:child_process";
import {
	DEFAULT_OPEN_COMMAND,
	loadCodeConfig,
	resolveConfigPaths,
} from "@n0n/code/config";

export type OpenCommand = readonly [string, ...string[]];
export type OpenTargets = readonly [string, ...string[]];

export interface OpenInvocation {
	executable: string;
	args: string[];
}

export function loadOpenCommand(): OpenCommand {
	const result = loadCodeConfig(resolveConfigPaths());
	if (!result.success) return copyOpenCommand(DEFAULT_OPEN_COMMAND);

	const [executable, ...args] = result.config.settings.cli.open_command;
	if (executable === undefined) return copyOpenCommand(DEFAULT_OPEN_COMMAND);
	return [executable, ...args];
}

export function openPaths(command: OpenCommand, paths: OpenTargets): void {
	const invocation = buildOpenInvocation(command, paths);
	const result = spawnSync(invocation.executable, invocation.args, {
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`打开命令退出，状态码: ${result.status ?? "unknown"}`);
	}
}

export function buildOpenInvocation(
	command: OpenCommand,
	paths: OpenTargets,
): OpenInvocation {
	const [executable, ...args] = command;
	return { executable, args: [...args, ...paths] };
}

function copyOpenCommand(command: readonly [string, ...string[]]): OpenCommand {
	const [executable, ...args] = command;
	return [executable, ...args];
}
