/**
 * Code Agent runner。
 *
 * 只接受类型化 options，不读取命令行参数，也不终止进程。
 */

import { existsSync, writeFileSync } from "node:fs";
import { style, writeln } from "@n0n/cli-ui";
import { buildToolsConfig } from "@n0n/core";
import type { FormatOptions } from "@n0n/format-prompt";
import { createLLMClient } from "@n0n/llm";
import { ensureDirs, resolveBasePaths } from "@n0n/shared";
import {
	DEFAULT_TOML,
	displayCodeConfig,
	type LoadedConfig,
	loadCodeConfig,
	resolveConfigPaths,
} from "./config-loader/index.ts";
import { withMemoryTags } from "./memory-tag.ts";
import type { NotifyConfig } from "./notify-sound.ts";

interface CodeRunBaseOptions {
	workspace: string;
	resumeFile?: string;
	saveEveryLoop?: boolean;
	promptVersion?: string;
	expandExec?: boolean;
}

export type CodeRunOptions =
	| (CodeRunBaseOptions & { mode: "interactive" })
	| (CodeRunBaseOptions & { mode: "oneshot"; prompt: string });

export async function runCode(options: CodeRunOptions): Promise<void> {
	const workspace = options.workspace;
	const configPaths = resolveConfigPaths(workspace);
	const configResult = loadCodeConfig(configPaths);

	if (!configResult.success) {
		writeln(style.red("配置加载失败："));
		for (const error of configResult.errors) {
			writeln(style.red(`  ${error.kind}: ${error.message}`));
		}

		if (!existsSync(configPaths.globalTomlPath)) {
			writeln();
			writeln(style.yellow("未找到全局配置文件，正在创建默认配置…"));
			writeFileSync(
				configPaths.globalTomlPath,
				`${DEFAULT_TOML.trimStart()}\n`,
				{ mode: 0o600 },
			);
			writeln(style.green(`已创建: ${configPaths.globalTomlPath}`));
			writeln(style.gray("请编辑此文件填入你的 API 密钥，然后重新启动。"));
		}

		throw new Error("n0n 配置加载失败");
	}

	await startConfiguredCode(configResult.config, workspace, options);
}

async function startConfiguredCode(
	config: LoadedConfig,
	workspace: string,
	options: CodeRunOptions,
): Promise<void> {
	const { settings } = config;
	const { llm } = settings;
	displayCodeConfig(config);

	const paths = resolveBasePaths(workspace);
	ensureDirs(paths);

	const formatOptions: FormatOptions = {
		strip_hint: settings.strip_hint,
	};
	const client = withMemoryTags(
		createLLMClient({ providerConfig: llm }, formatOptions),
		settings.memory_tag && llm.provider === "deepseek",
	);
	const toolsConfig = buildToolsConfig(settings.agent, settings.security, {
		workspace: paths.workspace,
		tempDir: paths.temp,
	});
	const notifyConfig: NotifyConfig = {
		enabled: settings.notify_sound,
		soundPath: settings.notify_sound_path || undefined,
	};

	const versionNote = options.promptVersion
		? ` [v${options.promptVersion}]`
		: "";
	writeln(
		style.bold("n0n code") +
			style.gray(` — Code Agent [${paths.workspace}]${versionNote}`),
	);
	writeln(
		style.gray('描述你的编码任务，AI 将直接修改项目代码。输入 "exit" 退出。'),
	);
	writeln(style.gray("支持多行输入 / 粘贴，按空行（回车）提交。"));
	writeln();

	const { startCodeRepl } = await import("./repl/index.ts");
	await startCodeRepl(paths, {
		initialInput: options.mode === "oneshot" ? options.prompt : undefined,
		exitAfterInitialInput: options.mode === "oneshot",
		resumeFile: options.resumeFile,
		saveEveryLoop: options.saveEveryLoop ?? false,
		promptVersion: options.promptVersion,
		client,
		toolsConfig,
		agentConfig: settings.agent,
		userInputConfig: settings.user_input,
		notifyConfig,
		expandExec: options.expandExec ?? false,
	});
}
