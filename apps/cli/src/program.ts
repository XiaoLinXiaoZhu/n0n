import { existsSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { type CodeRunOptions, runCode } from "@n0n/code";
import { scanGlobal, scanProject } from "@n0n/scan";
import {
	createSkill,
	initializeBuiltinSkills,
	installSkill,
	parseSkillLocation,
	showSkill,
	showSkillHelp,
	showSkillList,
} from "@n0n/skill";
import { Argument, Command, Option } from "commander";
import { version } from "../package.json";
import { runConfigCommand } from "./config-command.ts";
import { runEnvCommand } from "./env-command.ts";
import { parseScope, SCOPES, type Scope } from "./scope.ts";

const SCAN_TARGETS = ["global", "project"] as const;
type ScanTarget = (typeof SCAN_TARGETS)[number];

export type CliDependencies = {
	runCode: typeof runCode;
	scanGlobal: typeof scanGlobal;
	scanProject: typeof scanProject;
	showSkillHelp: typeof showSkillHelp;
	showSkill: typeof showSkill;
	initializeBuiltinSkills: typeof initializeBuiltinSkills;
	installSkill: typeof installSkill;
	createSkill: typeof createSkill;
	showSkillList: typeof showSkillList;
	runConfig: typeof runConfigCommand;
	runEnv: typeof runEnvCommand;
};

const defaultDependencies: CliDependencies = {
	runCode,
	scanGlobal,
	scanProject,
	showSkillHelp,
	showSkill,
	initializeBuiltinSkills,
	installSkill,
	createSkill,
	showSkillList,
	runConfig: runConfigCommand,
	runEnv: runEnvCommand,
};

export class CliUsageError extends Error {}

export function createProgram(
	dependencies: CliDependencies = defaultDependencies,
): Command {
	const program = new Command()
		.name("n0n")
		.description("n0n AI Code Agent")
		.version(version, "-v, --version")
		.exitOverride()
		.showHelpAfterError()
		.addHelpCommand("help [command]", "显示命令帮助");

	const codeOptions = addCodeOptions(program);
	program
		.argument("[path]", "存在的文件或目录，用作 workspace")
		.action(async function (pathValue: unknown) {
			await dependencies.runCode(
				toCodeRunOptions(parseOptionalString(pathValue), this, codeOptions),
			);
		});

	program.addCommand(createScanCommand(dependencies));
	program.addCommand(createSkillCommand(dependencies));
	program.addCommand(createConfigCommand(dependencies));
	program.addCommand(createEnvCommand(dependencies));
	return program;
}

interface CodeOptionSet {
	prompt: Option;
	workspace: Option;
	resume: Option;
	saveEveryLoop: Option;
	promptVersion: Option;
	expandExec: Option;
}

function addCodeOptions(command: Command): CodeOptionSet {
	const options: CodeOptionSet = {
		prompt: new Option("-p, --prompt <text>", "执行单次任务并退出"),
		workspace: new Option("--workspace <dir>", "指定 workspace"),
		resume: new Option("--resume <file>", "从对话日志恢复"),
		saveEveryLoop: new Option("--save-every-loop", "每轮自动保存对话"),
		promptVersion: new Option("--v <version>", "切换提示词版本"),
		expandExec: new Option("--expand-exec", "展开 exec 输出"),
	};
	for (const option of Object.values(options)) command.addOption(option);
	return options;
}

function toCodeRunOptions(
	path: string | undefined,
	command: Command,
	options: CodeOptionSet,
): CodeRunOptions {
	const workspaceOption = readOptionalStringOption(command, options.workspace);
	if (path !== undefined && workspaceOption !== undefined) {
		throw new CliUsageError("不能同时使用路径参数和 --workspace");
	}

	const workspace =
		workspaceOption !== undefined
			? resolveExistingWorkspace(workspaceOption)
			: path !== undefined
				? resolveExistingWorkspace(path)
				: resolveExistingWorkspace(process.cwd());
	const resumeFile = readOptionalStringOption(command, options.resume);
	const saveEveryLoop = readBooleanOption(command, options.saveEveryLoop);
	const promptVersion = readOptionalStringOption(
		command,
		options.promptVersion,
	);
	const expandExec = readBooleanOption(command, options.expandExec);
	const common = {
		workspace,
		...(resumeFile === undefined ? {} : { resumeFile }),
		...(saveEveryLoop ? { saveEveryLoop } : {}),
		...(promptVersion === undefined ? {} : { promptVersion }),
		...(expandExec ? { expandExec } : {}),
	};
	const prompt = readOptionalStringOption(command, options.prompt);
	return prompt === undefined
		? { ...common, mode: "interactive" }
		: { ...common, mode: "oneshot", prompt };
}

function resolveExistingWorkspace(input: string): string {
	const path = resolve(input);
	if (!existsSync(path)) {
		throw new CliUsageError(`未知命令或路径不存在: ${input}`);
	}
	return statSync(path).isDirectory() ? path : dirname(path);
}

function createScanCommand(dependencies: CliDependencies): Command {
	const detailOption = new Option("--detail", "显示完整 PATH 工具列表");
	return new Command("scan")
		.description("扫描全局或项目环境")
		.addArgument(new Argument("<target>", "扫描目标"))
		.addOption(detailOption)
		.action(async function (targetValue: unknown) {
			const target = parseScanTarget(targetValue);
			switch (target) {
				case "global":
					await dependencies.scanGlobal(readBooleanOption(this, detailOption));
					return;
				case "project":
					await dependencies.scanProject();
					return;
			}
		});
}

function parseScanTarget(value: unknown): ScanTarget {
	if (typeof value !== "string") {
		throw new CliUsageError("扫描目标必须是字符串");
	}
	const target = SCAN_TARGETS.find((candidate) => candidate === value);
	if (target === undefined) {
		throw new Error(
			`未知扫描目标 "${value}"，可用: ${SCAN_TARGETS.join(", ")}`,
		);
	}
	return target;
}

function createSkillCommand(dependencies: CliDependencies): Command {
	const skill = new Command("skill")
		.description("管理 skills")
		.action(() => dependencies.showSkillHelp());
	skill
		.command("help")
		.description("列出可自动激活的 skills")
		.action(() => dependencies.showSkillHelp());
	skill
		.command("read")
		.description("读取 skill 内容")
		.argument("<name>")
		.action((name: unknown) =>
			dependencies.showSkill(parseRequiredString(name)),
		);
	skill
		.command("init")
		.description("初始化内置 skills")
		.action(() => dependencies.initializeBuiltinSkills());
	skill
		.command("install")
		.description("安装本地 skill")
		.argument("<path>")
		.action((path: unknown) =>
			dependencies.installSkill(parseRequiredString(path)),
		);
	skill
		.command("create")
		.description("创建 skill 脚手架")
		.argument("<category>/<name>")
		.action((path: unknown) =>
			dependencies.createSkill(parseSkillLocation(parseRequiredString(path))),
		);
	const listAllOption = new Option("--all", "显示所有 activation 类型");
	const listColorOption = new Option("--color", "启用彩色输出");
	skill
		.command("list")
		.description("列出 skills")
		.addOption(listAllOption)
		.addOption(listColorOption)
		.action(function () {
			return dependencies.showSkillList({
				all: readBooleanOption(this, listAllOption),
				color: readBooleanOption(this, listColorOption),
			});
		});
	return skill;
}

function createConfigCommand(dependencies: CliDependencies): Command {
	return new Command("config")
		.description("打开全局或项目配置")
		.addArgument(createScopeArgument())
		.action((scopeValue: unknown) => {
			dependencies.runConfig({ scope: parseScopeValue(scopeValue) });
		});
}

function createEnvCommand(dependencies: CliDependencies): Command {
	return new Command("env")
		.description("打开 n0n 配置目录")
		.addArgument(createScopeArgument())
		.action((scopeValue: unknown) => {
			dependencies.runEnv({ scope: parseScopeValue(scopeValue) });
		});
}

function createScopeArgument(): Argument {
	return new Argument("[scope]", `范围: ${SCOPES.join(", ")}`).default("all");
}

function readOptionalStringOption(
	command: Command,
	option: Option,
): string | undefined {
	return parseOptionalString(command.getOptionValue(option.attributeName()));
}

function readBooleanOption(command: Command, option: Option): boolean {
	const value: unknown = command.getOptionValue(option.attributeName());
	if (value === undefined) return false;
	if (typeof value !== "boolean") {
		throw new CliUsageError(`选项 ${option.flags} 必须是布尔值`);
	}
	return value;
}

function parseOptionalString(value: unknown): string | undefined {
	if (value === undefined) return undefined;
	return parseRequiredString(value);
}

function parseRequiredString(value: unknown): string {
	if (typeof value !== "string") {
		throw new CliUsageError("命令参数必须是字符串");
	}
	return value;
}

function parseScopeValue(value: unknown): Scope {
	if (typeof value !== "string") {
		throw new CliUsageError("范围必须是字符串");
	}
	return parseScope(value);
}
