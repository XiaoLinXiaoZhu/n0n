/**
 * 配置摘要显示
 *
 * 与加载逻辑分离——可在启动时调用，也可通过 debug 命令独立触发。
 */

import { existsSync } from "node:fs";
import { style, writeln } from "@n0n/cli-ui";
import type { LoadedConfig } from "./loader.ts";

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
 */
export function displayCodeConfig(config: LoadedConfig): void {
	const { settings, trace, paths } = config;
	const { llm } = settings;

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

	writeln(`${style.cyan("i")} ${style.bold("当前配置:")}`);
	writeln();
	displayProvider(
		trace,
		"LLM",
		llm as unknown as Record<string, unknown>,
		"settings.llm",
	);

	writeln();
	writeln(`  ${style.dim("──")} ${style.cyan("设置")}`);
	writeln(
		`    ${style.white("strip_hint")} = ${settings.strip_hint} ${sourceTag(trace["settings.strip_hint"]?.source ?? "")}`,
	);
	writeln(
		`    ${style.white("memory_tag")} = ${settings.memory_tag} ${sourceTag(trace["settings.memory_tag"]?.source ?? "")}`,
	);
	writeln(
		`    ${style.white("notify_sound")} = ${settings.notify_sound} ${sourceTag(trace["settings.notify_sound"]?.source ?? "")}`,
	);

	writeln();
	writeln(`${style.green("✓")} 配置加载完成`);
	writeln();
}
