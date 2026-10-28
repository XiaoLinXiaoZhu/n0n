/**
 * Headless 模式 — 单次执行后退出，用于 Harbor 评测等非交互场景
 *
 * 客户在周期开始时一次性提供全部要求和输入，之后不再提供信息、作出决定或完成操作。
 *
 * 输出 JSON 结果到 stdout，日志输出到 stderr。
 */

import {
	type AgentConfig,
	agentLoop,
	buildToolsConfig,
	PlainRenderer,
	type SecurityConfig,
} from "@n0n/core";
import { type BaseWorkspacePaths, createSessionDir } from "@n0n/shared";
import { loadInitSkills, toSkill } from "@n0n/skill";
import { makeToolkit } from "@n0n/tools";
import type { DomainMessage, LLMClient, Skill } from "@n0n/types";
import { buildEnvironmentContext } from "./context-env.ts";
import { buildCodeSystemPrompt } from "./model-guidance.ts";
import { getPrompt } from "./prompts";
import { NO_CUSTOMER_PARTICIPATION_HINT } from "./tail-anchor.ts";

export interface HeadlessOptions {
	/** 任务指令 */
	instruction: string;
	/** 工作目录路径 */
	paths: BaseWorkspacePaths;
	/** 最大迭代次数 */
	max_iterations?: number;
	/** 超时（毫秒） */
	timeoutMs?: number;
	/** 额外的 system prompt 前缀 */
	systemPromptPrefix?: string;
	/** 提示词版本（如 "0.2"）；不传则使用默认版本 */
	promptVersion?: string;
	/** 已收集的环境上下文；提供时跳过 buildEnvironmentContext */
	envContext?: string;
	/** LLM Client 实例 */
	client: LLMClient;
	/** Agent 配置 */
	agentConfig: AgentConfig;
	/** 安全配置 */
	securityConfig: SecurityConfig;
}

export interface HeadlessResult {
	/** agent 是否成功完成（循环无错误结束） */
	success: boolean;
	/** 自然结束时的最终助手文本 */
	result: string | null;
	/** agent 的 report */
	report: string | null;
	/** 循环轮次 */
	rounds: number;
	/** 耗时（毫秒） */
	durationMs: number;
	/** 错误信息（如果有） */
	error: string | null;
	/** 会话目录 */
	sessionDir: string;
}

/** 从 history 中取最后一条助手文本（自然结束时的最终内容）。 */
function lastAssistantText(history: readonly DomainMessage[]): string | null {
	for (let i = history.length - 1; i >= 0; i--) {
		const message = history[i];
		if (message?.type === "assistant_text") return message.content;
	}
	return null;
}

export async function runHeadless(
	options: HeadlessOptions,
): Promise<HeadlessResult> {
	const {
		instruction,
		paths,
		max_iterations = 100,
		timeoutMs = 900_000, // 15 分钟默认
		systemPromptPrefix,
		promptVersion,
	} = options;

	const startTime = Date.now();

	// 构建 system prompt（含 init skills，拼装下沉到 format-prompt）
	const effectivePrompt = buildCodeSystemPrompt(
		getPrompt(promptVersion),
		options.client.modelId,
		systemPromptPrefix,
	);
	const initSkills = await loadInitSkills();
	const systemSkills: Skill[] = initSkills.map(toSkill);

	const renderer = new PlainRenderer();
	const sessionDir = createSessionDir(paths.sessions);
	const abortController = new AbortController();

	// 超时控制
	const timer = setTimeout(() => abortController.abort(), timeoutMs);

	// 构建 Toolkit — 无客户后续参与，不提供 customer://
	const toolsConfig = buildToolsConfig(
		options.agentConfig,
		options.securityConfig,
		{
			workspace: paths.workspace,
			sessionDir,
		},
	);
	toolsConfig.allowCustomer = false;
	const client = options.client;
	const toolkit = makeToolkit(toolsConfig, client.modelId);
	const envContext =
		options.envContext ?? (await buildEnvironmentContext(paths.workspace));

	const history: DomainMessage[] = [
		{
			type: "system_with_skill",
			content: effectivePrompt,
			skills: systemSkills,
		},
		{ type: "cache_breakpoint" },
		{
			type: "user_input",
			content: instruction,
			context: envContext || null,
			hint: NO_CUSTOMER_PARTICIPATION_HINT,
			mentionedSkills: [],
		},
	];

	try {
		const agentResult = await agentLoop(history, {
			client,
			toolkit,
			max_iterations,
			renderer,
			signal: abortController.signal,
		});

		const rounds = 1;
		const error = agentResult.report ?? null;
		const finalText =
			error == null ? lastAssistantText(agentResult.history) : null;
		if (finalText !== null) console.error(finalText.trimEnd());
		return {
			success: error == null,
			result: finalText,
			report: agentResult.report ?? null,
			rounds,
			durationMs: Date.now() - startTime,
			error,
			sessionDir,
		};
	} catch (err) {
		const message =
			err instanceof Error ? err.message : String(err ?? "Unknown error");
		return {
			success: false,
			result: null,
			report: null,
			rounds: 1,
			durationMs: Date.now() - startTime,
			error: abortController.signal.aborted
				? `Timeout after ${timeoutMs}ms`
				: message,
			sessionDir,
		};
	} finally {
		clearTimeout(timer);
	}
}
