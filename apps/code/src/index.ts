/**
 * Code Agent — 入口
 *
 * 代码编写场景的 agent，产出物为项目代码变更（而非 workflow）。
 * 默认以 cwd 为工作区（终端启动），macOS 双击时 fallback 到脚本所在目录。
 * 也可通过 --workspace 指定其他目录。
 *
 * 启动流程：
 * 1. 加载 TOML 配置（默认 → 全局 → 项目，后者覆盖前者）
 * 2. 从配置构造各组件
 * 3. 启动 REPL
 */

import { existsSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { style, writeln } from "@n0n/cli-ui";
import { buildToolsConfig, type EditBackendConfig } from "@n0n/core";
import { createLLMClient, createResponsesClient } from "@n0n/llm";
import {
	ensureDirs,
	type FormatOptions,
	parseWorkspaceArg,
	resolveBasePaths,
} from "@n0n/shared";
import {
	DEFAULT_TOML,
	displayCodeConfig,
	type LoadedConfig,
	loadCodeConfig,
	resolveConfigPaths,
} from "./config-loader.ts";
import type { NotifyConfig } from "./notify-sound.ts";

// ── 加载配置 ──

const configPaths = resolveConfigPaths();
const configResult = loadCodeConfig(configPaths);

if (!configResult.success) {
	writeln(style.red("配置加载失败："));
	for (const err of configResult.errors) {
		writeln(style.red(`  ${err.kind}: ${err.message}`));
	}

	// 如果全局 config.toml 不存在，提示创建
	if (!existsSync(configPaths.globalTomlPath)) {
		writeln();
		writeln(style.yellow("未找到全局配置文件，正在创建默认配置…"));
		writeFileSync(configPaths.globalTomlPath, `${DEFAULT_TOML.trimStart()}\n`, {
			mode: 0o600,
		});
		writeln(style.green(`已创建: ${configPaths.globalTomlPath}`));
		writeln(style.gray("请编辑此文件填入你的 API 密钥，然后重新启动。"));
	}

	process.exit(1);
}

const config: LoadedConfig = configResult.config;
const { settings } = config;
const { llm, editor } = settings;

// ── 配置摘要 ──

displayCodeConfig(config);

// ── CLI 选项 ──

const cliOpts = (globalThis as Record<string, unknown>).__n0n_cli_opts as
	| {
			resumeFile?: string;
			saveEveryLoop?: boolean;
			promptVersion?: string;
			expandExec?: boolean;
			filteredArgs?: string[];
	  }
	| undefined;
const resumeFile = cliOpts?.resumeFile;
const saveEveryLoop = cliOpts?.saveEveryLoop ?? false;
const promptVersion = cliOpts?.promptVersion;
const expandExec = cliOpts?.expandExec ?? false;

const { workspace, remainingArgs } = parseWorkspaceArg(
	cliOpts?.filteredArgs ?? process.argv.slice(2),
	"N0N_CODE_WORKSPACE",
	// macOS 双击打开时 cwd 为 home 目录，此时 fallback 到脚本所在目录
	process.cwd() === homedir()
		? dirname(resolve(process.argv[1] ?? "."))
		: process.cwd(),
);

const paths = resolveBasePaths(workspace);
ensureDirs(paths);

// ── 从配置构造各组件 ──

const llmConfig = { providerConfig: llm };
const formatOptions: FormatOptions = {
	strip_hint: settings.strip_hint,
};

const editBackendType = editor.edit_backend;

const editBackend: EditBackendConfig =
	editBackendType === "freeform-patch"
		? {
				type: "freeform-patch",
				responsesClient: createResponsesClient(editor),
			}
		: {
				type: "str-replace",
				editorClient: createLLMClient(
					{ providerConfig: editor },
					formatOptions,
				),
			};

const securityConfig = settings.security;

const client = createLLMClient(llmConfig, formatOptions);
const toolsConfig = buildToolsConfig(
	editBackend,
	settings.agent,
	securityConfig,
	{
		workspace: paths.workspace,
		tempDir: paths.temp,
	},
);

const notifyConfig: NotifyConfig = {
	enabled: settings.notify_sound,
	soundPath: settings.notify_sound_path || undefined,
};

const { startCodeRepl } = await import("./repl.ts");

const initialInput =
	remainingArgs.length > 0 ? remainingArgs.join(" ") : undefined;

const versionNote = promptVersion ? ` [v${promptVersion}]` : "";
writeln(
	style.bold("n0n code") +
		style.gray(` — Code Agent [${paths.workspace}]${versionNote}`),
);
writeln(
	style.gray('描述你的编码任务，AI 将直接修改项目代码。输入 "exit" 退出。'),
);
writeln(style.gray("支持多行输入 / 粘贴，按空行（回车）提交。"));
writeln();

await startCodeRepl(paths, {
	initialInput,
	resumeFile,
	saveEveryLoop,
	promptVersion,
	client,
	toolsConfig,
	agentConfig: settings.agent,
	userInputConfig: settings.user_input,
	notifyConfig,
	expandExec,
});
process.exit(0);
