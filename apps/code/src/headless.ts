/**
 * Headless 模式 — 单次执行后退出，用于 Harbor 评测等非交互场景
 *
 * 接收一条 instruction，驱动 agentLoop 执行到 completed 或超时，
 * 不等待用户输入，blocked 自动回复 "proceed with your best judgment"。
 *
 * 输出 JSON 结果到 stdout，日志输出到 stderr。
 */

import {
	type AgentConfig,
	agentLoop,
	buildToolsConfig,
	type EditBackendConfig,
	PlainRenderer,
	type SecurityConfig,
} from "@n0n/core";
import type { BaseWorkspacePaths } from "@n0n/shared";
import { loadInitSkills, toSkill } from "@n0n/skill";
import { makeToolkit } from "@n0n/tools";
import type { DomainMessage, LLMClient, Skill } from "@n0n/types";
import { buildEnvironmentContext } from "./context-env.ts";
import { codeProgressConfig } from "./progress-config.ts";
import { getPrompt } from "./prompts/index.ts";
import type { CodeProgressResult } from "./schema.ts";

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
	/** LLM Client 实例 */
	client: LLMClient;
	/** 编辑后端配置 */
	editBackend: EditBackendConfig;
	/** Agent 配置 */
	agentConfig: AgentConfig;
	/** 安全配置 */
	securityConfig: SecurityConfig;
}

export interface HeadlessResult {
	/** agent 是否成功完成 */
	success: boolean;
	/** agent 的 progress 结果 */
	result: CodeProgressResult | null;
	/** agent 的 report */
	report: string | null;
	/** 循环轮次 */
	rounds: number;
	/** 耗时（毫秒） */
	durationMs: number;
	/** 错误信息（如果有） */
	error: string | null;
}

function buildHeadlessHint(): string {
	return [
		"You are running in HEADLESS mode — there is no human to interact with.",
		"You MUST complete the task autonomously. Do NOT call progress with `blocked` status.",
		"If uncertain, make your best judgment and proceed.",
		"First, use `exec` to understand the codebase, then implement the fix, then verify.",
		"Call progress with `completed` status when done.",
	].join("\n");
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
	const basePrompt = getPrompt(promptVersion);
	const effectivePrompt = systemPromptPrefix
		? `${systemPromptPrefix}\n\n${basePrompt}`
		: basePrompt;
	const initSkills = await loadInitSkills();
	const systemSkills: Skill[] = initSkills.map(toSkill);

	const renderer = new PlainRenderer();
	const abortController = new AbortController();

	// 超时控制
	const timer = setTimeout(() => abortController.abort(), timeoutMs);

	// 构建 Toolkit — 含 progress config，供 fewshot 和 agentLoop 共用
	const toolsConfig = buildToolsConfig(
		options.editBackend,
		options.agentConfig,
		options.securityConfig,
		{
			workspace: paths.workspace,
			tempDir: paths.temp,
		},
	);
	const client = options.client;
	const toolkit = makeToolkit(codeProgressConfig, toolsConfig, client.modelId);
	const envContext = buildEnvironmentContext(paths.workspace);

	let history: DomainMessage[] = [
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
			hint: buildHeadlessHint(),
			mentionedSkills: [],
		},
	];

	let rounds = 0;
	const MAX_BLOCKED_RETRIES = 3;
	let blockedCount = 0;

	try {
		while (true) {
			const agentResult = await agentLoop<CodeProgressResult>(history, {
				client,
				toolkit,
				max_iterations,
				renderer,
				confirmFn: async () => "y",
				signal: abortController.signal,
			});

			history = agentResult.history;
			rounds++;
			const ir = agentResult.result;

			if (ir == null) {
				// Agent 异常终止
				return {
					success: false,
					result: null,
					report: agentResult.report ?? null,
					rounds,
					durationMs: Date.now() - startTime,
					error: agentResult.report ?? "Agent terminated without result",
				};
			}

			if (ir.status === "completed") {
				return {
					success: true,
					result: ir,
					report: agentResult.report ?? null,
					rounds,
					durationMs: Date.now() - startTime,
					error: null,
				};
			}

			if (ir.status === "working") {
				// working 状态：自动继续
				history.push({
					type: "user_input",
					content: "继续",
					context: null,
					hint: null,
					mentionedSkills: [],
				});
				continue;
			}

			if (ir.status === "blocked") {
				blockedCount++;
				if (blockedCount >= MAX_BLOCKED_RETRIES) {
					return {
						success: false,
						result: ir,
						report:
							"Agent requested assistance too many times in headless mode",
						rounds,
						durationMs: Date.now() - startTime,
						error: `Agent requested help ${blockedCount} times in headless mode`,
					};
				}
				// 自动回复，让 agent 继续
				history.push({
					type: "user_input",
					content:
						"You are in headless/autonomous mode. There is no human available. Proceed with your best judgment and complete the task.",
					context: null,
					hint: null,
					mentionedSkills: [],
				});
			}
		}
	} catch (err) {
		const message =
			err instanceof Error ? err.message : String(err ?? "Unknown error");
		return {
			success: false,
			result: null,
			report: null,
			rounds,
			durationMs: Date.now() - startTime,
			error: abortController.signal.aborted
				? `Timeout after ${timeoutMs}ms`
				: message,
		};
	} finally {
		clearTimeout(timer);
	}
}
