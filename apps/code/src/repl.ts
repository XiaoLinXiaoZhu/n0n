/**
 * Code REPL — 代码编写场景的交互循环
 *
 * 与 cli REPL 的区别：
 * - System prompt 为 code.md（代码 agent 而非 workflow builder）
 * - Progress schema 为 CodeProgressSchema（completed/working/blocked）
 * - Context 注入项目结构和 git 状态，而非 workflow 列表
 */

import { isTTY, style, writeln } from "@n0n/cli-ui";
import {
	type AgentConfig,
	agentLoop,
	HeartbeatKeeper,
	HeartbeatState,
	PlainRenderer,
} from "@n0n/core";
import {
	type BaseWorkspacePaths,
	loadConversation,
	parseDsl,
	saveConversation,
} from "@n0n/shared";
import { loadInitSkills, toSkill } from "@n0n/skill";
import type { ToolsConfig } from "@n0n/tools";
import { makeToolkit } from "@n0n/tools";
import type { DomainMessage, LLMClient, Skill } from "@n0n/types";
import { CodeRenderer } from "./code-renderer.ts";
import { buildEnvironmentContext } from "./context-env.ts";
import type { UserInputConfig } from "./multiline-input/config.ts";
import { type NotifyConfig, playNotifySound } from "./notify-sound.ts";
import { codeProgressConfig } from "./progress-config.ts";
import { ProgressWriter } from "./progress-writer.ts";
import { getPrompt } from "./prompts/index.ts";
import type { CodeProgressResult } from "./schema.ts";
import { parseAndInjectSkills } from "./skill-inject.ts";
import { createStdinController } from "./stdin-controller.ts";
import { UserPrompter } from "./user-prompter.ts";

export interface CodeReplOptions {
	initialInput?: string;
	resumeFile?: string;
	saveEveryLoop?: boolean;
	promptVersion?: string;
	client: LLMClient;
	toolsConfig: ToolsConfig;
	agentConfig: AgentConfig;
	userInputConfig?: UserInputConfig;
	notifyConfig?: NotifyConfig;
	expandExec?: boolean;
}

type CodeWorkspacePaths = BaseWorkspacePaths;

function makeUserInput(
	content: string,
	mentionedSkills: Skill[] = [],
	hint?: string | null,
	context?: string | null,
): DomainMessage {
	return {
		type: "user_input",
		content,
		context: context ?? null,
		hint: hint ?? null,
		mentionedSkills,
	};
}

export async function startCodeRepl(
	paths: CodeWorkspacePaths,
	options: CodeReplOptions,
): Promise<void> {
	const {
		initialInput,
		resumeFile,
		saveEveryLoop = false,
		promptVersion,
		expandExec = false,
		userInputConfig,
	} = options;

	// ── 依赖组装 ──

	const baseSystemPrompt = getPrompt(promptVersion);
	const { client, toolsConfig, agentConfig } = options;

	const initSkills = await loadInitSkills();
	const systemSkills: Skill[] = initSkills.map(toSkill);
	const systemMessage: DomainMessage = {
		type: "system_with_skill",
		content: baseSystemPrompt,
		skills: systemSkills,
	};
	const notifyConfig = options.notifyConfig ?? { enabled: false };
	const toolkit = makeToolkit(codeProgressConfig, toolsConfig, client.modelId);

	const canInteract = typeof process.stdin.setRawMode === "function";
	const renderer = canInteract
		? new CodeRenderer(paths, { expandExec })
		: new PlainRenderer();

	const stdin = canInteract ? createStdinController() : null;
	const prompter = new UserPrompter(stdin, userInputConfig);
	const progressWriter = new ProgressWriter(paths.temp);

	// ── 心跳保活 ──

	const keeper = client.heartbeat
		? new HeartbeatKeeper({
				sendHeartbeat: async (request) => {
					const usage = (await client.heartbeat?.(request)) ?? null;
					return usage !== null;
				},
				onTick: (count, maxCount) => {
					if (isTTY) {
						writeln(style.gray(`  ⏳ 缓存保活 (${count}/${maxCount})`));
					}
				},
				onExpired: (reason) => {
					if (isTTY) {
						const msg =
							reason === "max_count"
								? "达到上限"
								: reason === "error"
									? "请求失败"
									: "缓存已过期";
						writeln(style.gray(`  ⏸ 缓存保活已停止（${msg}）`));
					}
				},
			})
		: null;
	if (stdin && keeper) {
		stdin.onPause = () => {
			if (keeper.state === HeartbeatState.TICKING) {
				keeper.stop();
				writeln(style.gray("⏸ 缓存保活已停止。下次提交消息后会自动恢复。"));
			}
		};
	}

	// ── 初始化 history ──

	let history: DomainMessage[];
	let userInput: string | null;
	let isFirstInput: boolean;
	let envContext: string | null = null;

	if (resumeFile) {
		try {
			const log = loadConversation(resumeFile);
			history = log.history;
			writeln(
				style.green("✓") +
					style.gray(
						` 已从 ${resumeFile} 恢复对话（${log.history.length} 条消息）`,
					),
			);
			writeln();
			isFirstInput = false;
			userInput = await prompter.prompt();
		} catch (err) {
			const message =
				err instanceof Error ? err.message : String(err ?? "未知错误");
			writeln(`${style.red("✗")} 恢复对话失败: ${message}`);
			writeln(style.gray("  将以全新对话启动。"));
			writeln();
			isFirstInput = true;
			envContext = buildEnvironmentContext(paths.workspace);
			history = [systemMessage, { type: "cache_breakpoint" }];
			userInput = initialInput ?? (await prompter.prompt());
		}
	} else {
		isFirstInput = true;
		envContext = buildEnvironmentContext(paths.workspace);
		history = [systemMessage, { type: "cache_breakpoint" }];
		userInput = initialInput ?? (await prompter.prompt());
	}

	let autoResume = false;

	// ── 主循环 ──

	while (true) {
		if (userInput === null) break;
		if (userInput.trim().toLowerCase() === "exit") break;
		if (userInput.trim() === "") {
			userInput = await prompter.prompt();
			continue;
		}

		// `log` 命令
		if (userInput.trim().toLowerCase() === "log") {
			try {
				const filePath = saveConversation(
					history,
					paths.workspace,
					paths.workspace,
				);
				writeln(`${style.green("✓")} 对话已保存到 ${style.cyan(filePath)}`);
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err ?? "未知错误");
				writeln(`${style.red("✗")} 保存对话失败: ${message}`);
			}
			writeln();
			userInput = await prompter.prompt();
			continue;
		}

		// `pause` 命令
		if (userInput.trim().toLowerCase() === "pause") {
			if (keeper && keeper.state === HeartbeatState.TICKING) {
				keeper.stop();
				writeln(style.gray("⏸ 缓存保活已停止。下次提交消息后会自动恢复。"));
			} else {
				writeln(style.gray("当前没有活跃的缓存保活。"));
			}
			writeln();
			userInput = await prompter.prompt();
			continue;
		}

		// ── 推入用户输入 ──

		if (autoResume) {
			autoResume = false;
			keeper?.stop();
		} else {
			keeper?.stop();
			const skillResult = await parseAndInjectSkills(userInput);
			if (skillResult.notFound.length > 0) {
				writeln(
					style.yellow("?") +
						` skill 未找到: ${skillResult.notFound.join(", ")}`,
				);
			}
			const finalText = skillResult.cleanedText || userInput;
			const context = isFirstInput ? envContext : null;
			isFirstInput = false;
			history.push(
				makeUserInput(
					finalText,
					skillResult.mentionedSkills ?? [],
					null,
					context,
				),
			);
		}

		// ── Agent 运行 ──

		if (stdin) {
			stdin.abortController = new AbortController();
			stdin.phase = "agent";
		}

		let agentResult: Awaited<ReturnType<typeof agentLoop<CodeProgressResult>>>;
		try {
			agentResult = await agentLoop<CodeProgressResult>(history, {
				client,
				toolkit,
				max_iterations: agentConfig.max_iterations,
				max_idle_rounds: agentConfig.max_idle_rounds,
				renderer,
				confirmFn: (question) => prompter.confirm(question),
				signal: stdin?.abortController.signal,
			});
		} catch (err) {
			writeln();
			writeln(`${style.red("✗")} Agent 运行出错，已中止本轮对话。`);
			const message =
				err instanceof Error ? err.message : String(err ?? "未知错误");
			writeln(style.gray(`  ${message}`));
			writeln();
			userInput = await prompter.prompt();
			continue;
		} finally {
			if (stdin) stdin.phase = "idle";
		}

		history = agentResult.history;
		keeper?.start({
			messages: history,
			tools: agentResult.tools,
			toolChoice: "auto",
		});

		if (saveEveryLoop) {
			try {
				saveConversation(
					history,
					paths.workspace,
					paths.workspace,
					"n0n-conversation-latest.json",
				);
			} catch {
				// 自动保存失败不阻断 REPL
			}
		}

		if (stdin?.abortController.signal.aborted) {
			writeln();
			userInput = await prompter.prompt();
			continue;
		}

		const ir = agentResult.result;
		writeln();

		if (ir == null) {
			writeln(`${style.red("✗")} Agent 异常终止`);
			if (agentResult.report) writeln(style.gray(`  ${agentResult.report}`));
			writeln();
			userInput = await prompter.prompt();
			continue;
		}

		progressWriter.write(ir);

		switch (ir.status) {
			case "blocked": {
				writeln(`${style.yellow("?")} ${ir.content}`);
				writeln();
				const blockItems = parseDsl(ir.content);
				for (const [i, item] of blockItems.entries()) {
					writeln(`  ${style.cyan(`${i + 1})`)} ${item.label}`);
					if (item.detail) {
						writeln(`     ${style.gray(item.detail)}`);
					}
				}
				writeln();
				playNotifySound(notifyConfig);
				userInput = await prompter.prompt();
				continue;
			}
			case "working": {
				writeln(`${style.cyan("⏳")} 进行中: ${ir.content}`);
				writeln();
				history.push(makeUserInput("", [], "系统收到了你的汇报，请你继续保持当前节奏完成工作。当前消息未发送给用户，若遇到问题时用 progress(blocked) 主动提问。", null));
				autoResume = true;
				continue;
			}
			case "completed": {
				writeln(`${style.green("✓")} 完成: ${ir.content}`);
				if (agentResult.report) {
					writeln(style.gray(`  ${agentResult.report}`));
				}
				writeln();
				playNotifySound(notifyConfig);
				userInput = await prompter.prompt();
				break;
			}
			default: {
				const _exhaustive: never = ir.status;
				break;
			}
		}
	}

	keeper?.stop();
	stdin?.dispose();
	writeln(style.gray("Bye!"));
}
