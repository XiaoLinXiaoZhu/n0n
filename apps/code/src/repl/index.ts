/**
 * Code REPL — 代码编写场景的交互循环
 *
 * 与 cli REPL 的区别：
 * - System prompt 为 code.md（代码 agent 而非 workflow builder）
 * - Show schema 区分非终态客户任务与质量终态
 * - Context 注入项目结构和 git 状态，而非 workflow 列表
 */

import { style, writeln } from "@n0n/cli-ui";
import {
	type AgentConfig,
	agentLoop,
	HeartbeatState,
	PlainRenderer,
} from "@n0n/core";
import {
	type BaseWorkspacePaths,
	loadConversation,
	saveConversation,
} from "@n0n/shared";
import { loadInitSkills, toSkill } from "@n0n/skill";
import type { ToolsConfig } from "@n0n/tools";
import { makeToolkit } from "@n0n/tools";
import type { DomainMessage, LLMClient, Skill } from "@n0n/types";
import { CodeRenderer } from "../code-renderer.ts";
import { buildEnvironmentContext } from "../context-env.ts";
import { buildCodeSystemPrompt } from "../model-guidance.ts";
import type { UserInputConfig } from "../multiline-input/config.ts";
import type { NotifyConfig } from "../notify-sound.ts";
import { getPrompt } from "../prompts/index.ts";
import type { CodeShowResult } from "../schema.ts";
import {
	noCustomerParticipationShowConfig,
	showConfig,
} from "../show-config.ts";
import { ShowWriter } from "../show-writer.ts";
import { parseAndInjectSkills } from "../skill-inject.ts";
import { createStdinController } from "../stdin-controller.ts";
import {
	CODE_TAIL_ANCHOR,
	NO_CUSTOMER_PARTICIPATION_HINT,
} from "../tail-anchor.ts";
import { UserPrompter } from "../user-prompter.ts";
import { handleShowResults } from "./handle-result.ts";
import { createHeartbeatKeeper } from "./heartbeat.ts";

export interface CodeReplOptions {
	initialInput?: string;
	exitAfterInitialInput?: boolean;
	resumeFile?: string;
	saveEveryLoop?: boolean;
	promptVersion?: string;
	client: LLMClient;
	toolsConfig: ToolsConfig;
	agentConfig: AgentConfig;
	userInputConfig?: UserInputConfig;
	notifyConfig?: NotifyConfig;
	expandExec?: boolean;
	sessionDir: string;
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
		exitAfterInitialInput = false,
		resumeFile,
		saveEveryLoop = false,
		promptVersion,
		expandExec = false,
		userInputConfig,
	} = options;

	// ── 依赖组装 ──

	const { client, toolsConfig, agentConfig } = options;
	const baseSystemPrompt = buildCodeSystemPrompt(
		getPrompt(promptVersion),
		client.modelId,
	);

	const initSkills = await loadInitSkills();
	const systemSkills: Skill[] = initSkills.map(toSkill);
	const systemMessage: DomainMessage = {
		type: "system_with_skill",
		content: baseSystemPrompt,
		skills: systemSkills,
	};
	const notifyConfig = options.notifyConfig ?? { enabled: false };
	const toolkit = makeToolkit(
		exitAfterInitialInput ? noCustomerParticipationShowConfig : showConfig,
		toolsConfig,
		client.modelId,
	);

	const canInteract = typeof process.stdin.setRawMode === "function";
	const renderer = canInteract
		? new CodeRenderer(paths, {
				expandExec,
				sessionDir: options.sessionDir,
			})
		: new PlainRenderer();

	const stdin = canInteract ? createStdinController() : null;
	const prompter = new UserPrompter(stdin, userInputConfig);
	const showWriter = new ShowWriter(options.sessionDir);

	// ── 心跳保活 ──

	const keeper = createHeartbeatKeeper(client);
	// stdin Ctrl+P 暂停心跳
	if (stdin && keeper) {
		stdin.setPauseHandler(() => {
			if (keeper.state === HeartbeatState.TICKING) {
				keeper.stop();
				writeln(style.gray("⏸ 缓存保活已停止。下次提交消息后会自动恢复。"));
			}
		});
	}

	const promptNext = async (): Promise<string | null> =>
		exitAfterInitialInput ? null : await prompter.prompt();

	try {
		// ── 初始化 history ──

		let history: DomainMessage[];
		let userInput: string | null;
		let isFirstInput: boolean;

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
				userInput = initialInput ?? (await prompter.prompt());
			} catch (err) {
				const message =
					err instanceof Error ? err.message : String(err ?? "未知错误");
				writeln(`${style.red("✗")} 恢复对话失败: ${message}`);
				writeln(style.gray("  将以全新对话启动。"));
				writeln();
				isFirstInput = true;
				history = [systemMessage, { type: "cache_breakpoint" }];
				userInput = initialInput ?? (await prompter.prompt());
			}
		} else {
			isFirstInput = true;
			history = [systemMessage, { type: "cache_breakpoint" }];
			userInput = initialInput ?? (await prompter.prompt());
		}

		let autoResume = false;

		// ── 主循环 ──

		while (true) {
			if (userInput === null) break;
			if (userInput.trim().toLowerCase() === "exit") break;
			if (userInput.trim() === "") {
				userInput = await promptNext();
				continue;
			}

			// `log` 命令
			if (userInput.trim().toLowerCase() === "log") {
				try {
					const filePath = saveConversation(
						history,
						paths.workspace,
						options.sessionDir,
					);
					writeln(`${style.green("✓")} 对话已保存到 ${style.cyan(filePath)}`);
				} catch (err) {
					const message =
						err instanceof Error ? err.message : String(err ?? "未知错误");
					writeln(`${style.red("✗")} 保存对话失败: ${message}`);
				}
				writeln();
				userInput = await promptNext();
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
				userInput = await promptNext();
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
				const context = isFirstInput
					? await buildEnvironmentContext(paths.workspace)
					: null;
				isFirstInput = false;
				history.push(
					makeUserInput(
						finalText,
						skillResult.mentionedSkills ?? [],
						exitAfterInitialInput
							? NO_CUSTOMER_PARTICIPATION_HINT
							: CODE_TAIL_ANCHOR,
						context,
					),
				);
			}

			// ── Agent 运行 ──

			const agentSignal = stdin?.beginAgent();

			let agentResult: Awaited<ReturnType<typeof agentLoop<CodeShowResult>>>;
			try {
				agentResult = await agentLoop<CodeShowResult>(history, {
					client,
					toolkit,
					max_iterations: agentConfig.max_iterations,
					max_idle_rounds: agentConfig.max_idle_rounds,
					renderer,
					confirmFn: (question) => prompter.confirm(question),
					signal: agentSignal,
				});
			} catch (err) {
				writeln();
				writeln(`${style.red("✗")} Agent 运行出错，已中止本轮对话。`);
				const message =
					err instanceof Error ? err.message : String(err ?? "未知错误");
				writeln(style.gray(`  ${message}`));
				writeln();
				userInput = await promptNext();
				continue;
			} finally {
				stdin?.enterIdle();
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
						options.sessionDir,
						"n0n-conversation-latest.json",
					);
				} catch {
					// 自动保存失败不阻断 REPL
				}
			}

			if (agentSignal?.aborted) {
				writeln();
				userInput = await promptNext();
				continue;
			}

			const results = agentResult.results;
			writeln();

			if (results.length === 0) {
				writeln(`${style.red("✗")} Agent 异常终止`);
				if (agentResult.report) writeln(style.gray(`  ${agentResult.report}`));
				writeln();
				userInput = await promptNext();
				continue;
			}

			const outcome = handleShowResults(results, showWriter, notifyConfig);
			switch (outcome.action) {
				case "wait_for_customer":
					userInput = await promptNext();
					break;
				case "auto_resume":
					history.push(outcome.historyEntry);
					autoResume = true;
					continue;
				case "terminal":
					userInput = await promptNext();
					break;
			}
		}
	} finally {
		keeper?.stop();
		stdin?.dispose();
		writeln(style.gray("Bye!"));
	}
}
