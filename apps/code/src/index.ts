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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { style, writeln } from "@n0n/cli-ui";
import { type ConfigSource, getConfig } from "@n0n/config";
import {
	type AgentConfig,
	buildToolsConfig,
	type EditBackendConfig,
	type SecurityConfig,
} from "@n0n/core";
import {
	createLLMClient,
	createResponsesClient,
	ProviderConfigSchema,
} from "@n0n/llm";
import {
	ensureDirs,
	type FormatOptions,
	parseWorkspaceArg,
	resolveBasePaths,
} from "@n0n/shared";
import { z } from "zod";
import type { NotifyConfig } from "./notify-sound.ts";

// ── 配置 schema ──

const codeConfigSchema = z.object({
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
		editor: ProviderConfigSchema,
	}),
});

// ── 默认 TOML ──

const DEFAULT_TOML = `
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
`;

// ── 加载配置 ──

const globalConfigDir = resolve(homedir(), ".n0n");
if (!existsSync(globalConfigDir)) {
	mkdirSync(globalConfigDir, { recursive: true });
}

const globalTomlPath = resolve(globalConfigDir, "config.toml");
const projectTomlPath = resolve(process.cwd(), ".n0n", "config.toml");

const sources: ConfigSource[] = [{ name: "默认", content: DEFAULT_TOML }];

if (existsSync(globalTomlPath)) {
	sources.push({
		name: "全局",
		content: readFileSync(globalTomlPath, "utf-8"),
	});
}

if (existsSync(projectTomlPath)) {
	sources.push({
		name: "项目",
		content: readFileSync(projectTomlPath, "utf-8"),
	});
}

// ── 构建 envPool（全局 .env → 项目 .env → process.env，后者覆盖前者） ──

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

const globalEnvPath = resolve(globalConfigDir, ".env");
const projectEnvPath = resolve(process.cwd(), ".n0n", ".env");

const envPool: Record<string, string> = {};

// 全局 .env
if (existsSync(globalEnvPath)) {
	Object.assign(envPool, parseEnvFile(readFileSync(globalEnvPath, "utf-8")));
}

// 项目 .env（覆盖全局）
if (existsSync(projectEnvPath)) {
	Object.assign(envPool, parseEnvFile(readFileSync(projectEnvPath, "utf-8")));
}

// process.env（最高优先级）
for (const [k, v] of Object.entries(process.env)) {
	if (v !== undefined) envPool[k] = v;
}

const configResult = getConfig(codeConfigSchema, sources, envPool);

if (!configResult.success) {
	writeln(style.red("配置加载失败："));
	for (const err of configResult.errors) {
		writeln(style.red(`  ${err.kind}: ${err.message}`));
	}

	// 如果全局 config.toml 不存在，提示创建
	if (!existsSync(globalTomlPath)) {
		writeln();
		writeln(style.yellow("未找到全局配置文件，正在创建默认配置…"));
		writeFileSync(globalTomlPath, `${DEFAULT_TOML.trimStart()}\n`, {
			mode: 0o600,
		});
		writeln(style.green(`已创建: ${globalTomlPath}`));
		writeln(style.gray("请编辑此文件填入你的 API 密钥，然后重新启动。"));
	}

	process.exit(1);
}

const { settings } = configResult.data;
const { llm, editor } = settings;

// ── 配置摘要 ──

const trace = configResult.trace;

function maskSecret(value: string): string {
	if (value.length <= 8) return "****";
	return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function sourceTag(source: string): string {
	switch (source) {
		case "默认": return style.dim("[默认]");
		case "全局": return style.cyan("[全局]");
		case "项目": return style.green("[项目]");
		case "zod default": return style.dim("[default]");
		default: return style.dim(`[${source}]`);
	}
}

function formatValue(key: string, value: unknown): string {
	if (key === "api_key" && typeof value === "string") return maskSecret(value);
	if (typeof value === "object" && value !== null) return JSON.stringify(value);
	return String(value);
}

function displayProvider(label: string, pc: Record<string, unknown>, prefix: string): void {
	writeln(`  ${style.dim("──")} ${style.cyan(label)}`);
	for (const [key, value] of Object.entries(pc)) {
		const src = trace[`${prefix}.${key}`]?.source;
		writeln(`    ${style.white(key)} = ${formatValue(key, value)}${src ? ` ${sourceTag(src)}` : ""}`);
	}
}

// 配置来源
writeln(`${style.cyan("i")} ${style.bold("配置来源:")}`);
writeln();
writeln(`  ${style.gray("全局 env:")}  ${style.white(globalEnvPath)}${existsSync(globalEnvPath) ? " " + style.green("✓") : " " + style.dim("(不存在)")}`);
writeln(`  ${style.gray("项目 env:")}  ${style.white(projectEnvPath)}${existsSync(projectEnvPath) ? " " + style.green("✓") : " " + style.dim("(不存在)")}`);
writeln(`  ${style.gray("全局 TOML:")} ${style.white(globalTomlPath)}${existsSync(globalTomlPath) ? " " + style.green("✓") : " " + style.dim("(不存在)")}`);
writeln(`  ${style.gray("项目 TOML:")} ${style.white(projectTomlPath)}${existsSync(projectTomlPath) ? " " + style.green("✓") : " " + style.dim("(不存在)")}`);
writeln();

// LLM & Editor
writeln(`${style.cyan("i")} ${style.bold("当前配置:")}`);
writeln();
displayProvider("LLM", llm as unknown as Record<string, unknown>, "settings.llm");
writeln();
displayProvider("Editor", editor as unknown as Record<string, unknown>, "settings.editor");

// 通用设置
writeln();
writeln(`  ${style.dim("──")} ${style.cyan("设置")}`);
writeln(`    ${style.white("strip_hint")} = ${settings.strip_hint} ${sourceTag(trace["settings.strip_hint"]?.source ?? "")}`);
writeln(`    ${style.white("notify_sound")} = ${settings.notify_sound} ${sourceTag(trace["settings.notify_sound"]?.source ?? "")}`);

writeln();
writeln(`${style.green("✓")} 配置加载完成`);
writeln();

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
	stripHint: settings.strip_hint,
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

// 从配置直接构造 AgentConfig 和 SecurityConfig
const agentConfig: AgentConfig = {
	maxIterations: settings.agent.max_iterations,
	maxIdleRounds: settings.agent.max_idle_rounds,
	defaultExecWaitfor: settings.agent.default_exec_waitfor,
};
const securityConfig: SecurityConfig = {
	blockedCommands: settings.security.blocked_commands,
};

const client = createLLMClient(llmConfig, formatOptions);
const toolsConfig = buildToolsConfig(editBackend, agentConfig, securityConfig, {
	workspace: paths.workspace,
	tempDir: paths.temp,
});

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
	agentConfig,
	notifyConfig,
	expandExec,
});
process.exit(0);
