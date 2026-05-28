/**
 * Fairy CLI 入口 — 交互式对话循环
 *
 * MVP 实现：从状态重建上下文，执行 agentLoop，更新状态。
 * 每轮对话都是 state + stimulus → response + new-state。
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { createInterface } from "node:readline";
import { isTTY, label, RichRenderer, style, writeln } from "@n0n/cli-ui";
import { type ConfigSource, getConfig } from "@n0n/config";
import { agentLoop, buildToolsConfig, PlainRenderer } from "@n0n/core";
import { createLLMClient, ProviderConfigSchema } from "@n0n/llm";
import { type FormatOptions, parseWorkspaceArg } from "@n0n/shared";
import { makeToolkit } from "@n0n/tools";
import type { DomainMessage } from "@n0n/types";
import { z } from "zod";
import { fairyProgressConfig } from "./progress-config.ts";
import type { FairyProgressResult } from "./schema.ts";
import {
	ensureFairyFiles,
	type FairyPaths,
	loadHistory,
	resolveFairyPaths,
	saveHistory,
} from "./state.ts";
import { buildView } from "./view.ts";

// ── 配置加载 ──

const fairyConfigSchema = z.object({
	settings: z.object({
		strip_hint: z.boolean().default(true),
		llm: ProviderConfigSchema,
		editor: ProviderConfigSchema,
		agent: z.object({
			max_iterations: z.number().default(50),
			max_idle_rounds: z.number().default(5),
			default_exec_waitfor: z.number().default(120),
		}),
		security: z.object({
			blocked_commands: z.array(z.string()).default([]),
		}),
	}),
});

const DEFAULT_TOML = `
[settings]

[settings.agent]
max_iterations = 50
max_idle_rounds = 5
default_exec_waitfor = 120

[settings.security]
blocked_commands = []
`;

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

const configResult = getConfig(fairyConfigSchema, sources, envPool);

if (!configResult.success) {
	writeln(style.red("配置加载失败："));
	for (const err of configResult.errors) {
		writeln(style.red(`  ${err.kind}: ${err.message}`));
	}
	process.exit(1);
}

const { settings } = configResult.data;

// ── 初始化 ──

const { workspace, remainingArgs } = parseWorkspaceArg(
	process.argv.slice(2),
	"N0N_FAIRY_WORKSPACE",
	`${process.cwd()}/.runtime/fairy`,
);

const paths = resolveFairyPaths(workspace);
ensureFairyFiles(paths);

const llmConfig = { providerConfig: settings.llm };
const editorLlmConfig = { providerConfig: settings.editor };
const formatOptions: FormatOptions = {
	stripHint: settings.strip_hint,
};

const client = createLLMClient(llmConfig, formatOptions);
const editorClient = createLLMClient(editorLlmConfig, formatOptions);
const toolsConfig = buildToolsConfig(
	{ type: "str-replace", editorClient },
	settings.agent,
	settings.security,
	{ workspace: paths.workspace, tempDir: paths.temp },
);

// ── REPL ──

async function main(): Promise<void> {
	const rl = createInterface({
		input: process.stdin,
		output: process.stdout,
		terminal: isTTY,
	});

	const prompt = (query: string): Promise<string> =>
		new Promise((resolve) => rl.question(query, resolve));

	const renderer = isTTY ? new RichRenderer() : new PlainRenderer();
	const toolkit = makeToolkit(fairyProgressConfig, toolsConfig, client.modelId);

	let abortController = new AbortController();
	let agentRunning = false;

	// Ctrl+C 处理
	if (isTTY) {
		rl.on("SIGINT", () => {
			if (agentRunning) {
				abortController.abort();
			} else {
				rl.close();
			}
		});
	} else {
		process.on("SIGINT", () => {
			if (agentRunning) {
				abortController.abort();
			} else {
				process.exit(0);
			}
		});
	}

	writeln(
		`${style.bold("fairy")} ${style.gray(`— Persistent AI Companion [${paths.workspace}]`)}`,
	);
	writeln(style.gray('与你的 fairy 对话。输入 "exit" 退出，Ctrl+C 中断输出。'));
	writeln();

	const initialInput =
		remainingArgs.length > 0 ? remainingArgs.join(" ") : undefined;

	let userInput = initialInput ?? (await prompt(`${label.user()} `));

	while (userInput.trim().toLowerCase() !== "exit") {
		// 每轮从状态重建上下文
		const history = loadHistory(paths);
		const viewMessages = buildView(history, paths, userInput);
		const viewSize = viewMessages.length;

		abortController = new AbortController();
		agentRunning = true;

		let agentResult: Awaited<ReturnType<typeof agentLoop<FairyProgressResult>>>;
		try {
			agentResult = await agentLoop<FairyProgressResult>(viewMessages, {
				client,
				toolkit,
				max_iterations: settings.agent.max_iterations,
				max_idle_rounds: settings.agent.max_idle_rounds,
				renderer,
				signal: abortController.signal,
			});
		} catch (err) {
			writeln();
			writeln(`${style.red("✗")} Agent 运行出错，已中止本轮。`);
			const message =
				err instanceof Error ? err.message : String(err ?? "未知错误");
			writeln(style.gray(`  ${message}`));
			writeln();
			userInput = await prompt(`${label.user()} `);
			continue;
		} finally {
			agentRunning = false;
		}

		// 被用户中断
		if (abortController.signal.aborted) {
			writeln();
			userInput = await prompt(`${label.user()} `);
			continue;
		}

		// 更新全局对话记录：追加本轮产生的新消息
		appendNewMessages(paths, history, agentResult.history, viewSize);

		writeln();

		if (agentResult.result == null) {
			writeln(`${style.red("✗")} Agent 异常终止`);
			if (agentResult.report) writeln(style.gray(`  ${agentResult.report}`));
		} else {
			writeln(agentResult.result.content);
		}

		writeln();
		userInput = await prompt(`${label.user()} `);
	}

	rl.close();
	writeln(style.gray("Bye!"));
}

/**
 * 追加本轮新消息到全局对话记录。
 */
function appendNewMessages(
	paths: FairyPaths,
	oldHistory: DomainMessage[],
	agentHistory: DomainMessage[],
	viewSize: number,
): void {
	const stimulusIdx = viewSize - 1;
	const stimulus = agentHistory[stimulusIdx];
	const agentNewMessages = agentHistory.slice(viewSize);

	const toAppend: DomainMessage[] = [];
	if (stimulus) toAppend.push(stimulus);
	toAppend.push(...agentNewMessages);

	const updated = [...oldHistory, ...toAppend];
	saveHistory(paths, updated);
}

main().catch((err) => {
	console.error("Fatal error:", err);
	process.exit(1);
});
