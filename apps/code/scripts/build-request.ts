/**
 * build-request.ts — 端到端构建 Code Agent 的完整 LLM 请求 JSON
 *
 * 通过注入 mock LLMClient 驱动真实初始化流程和 agentLoop，
 * 在 mock client 的 stream() 中截获请求，转换为 OpenAI 消息格式后输出 JSON。
 * 可供 Jinja2 chat template 渲染为各模型的原始文本流。
 *
 * 用法：
 *   bun run apps/code/scripts/build-request.ts
 *   bun run apps/code/scripts/build-request.ts --user "修复登录 bug"
 */

import { resolve } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { formatPrompt } from "@n0n/format-prompt";
import { createTagAdapter } from "@n0n/shared";
import {
	agentLoop,
	buildToolsConfig,
	PlainRenderer,
} from "@n0n/core";
import { makeToolkit } from "@n0n/tools";
import { loadInitSkills, toSkill } from "@n0n/skill";
import type {
	DomainMessage,
	LLMClient,
	StreamEvent,
	StreamRequest,
	ToolDefinition,
	TagAdapter,
} from "@n0n/types";

import { buildCodeSystemPrompt } from "../src/model-guidance.ts";
import { getPrompt } from "../src/prompts";
import { buildEnvironmentContext } from "../src/context-env.ts";
import { showConfig } from "../src/show-config.ts";
import { CODE_TAIL_ANCHOR } from "../src/tail-anchor.ts";

// ── CLI 参数 ──

function getArg(name: string, fallback: string): string {
	const idx = process.argv.indexOf(name);
	return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const userMessage = getArg(
	"--user",
	"帮我阅读当前项目的 README，然后总结项目的核心功能。",
);

// ── 输出路径 ──

const workspace = process.cwd();
const sessionDir = resolve(workspace, ".n0n", "previews", "preview-session");
const outPath = resolve(sessionDir, "code-request.json");

// ── Mock LLMClient ──

interface CapturedRequest {
	messages: DomainMessage[];
	tools: ToolDefinition[];
}

let captured: CapturedRequest | null = null;

const tags: TagAdapter = createTagAdapter("default");

const mockClient: LLMClient = {
	modelId: "mock-build-request",
	tagStyle: "default",
	tags,

	async *stream(request: StreamRequest): AsyncGenerator<StreamEvent> {
		// structuredClone 避免 agentLoop 后续 push 污染截获的快照
		captured = {
			messages: structuredClone(request.messages),
			tools: request.tools ?? [],
		};

		const callId = "preview_done";
		const args = JSON.stringify({
			type: "qualified delivery",
			content: "Request capture complete.",
		});

		yield { type: "tool_call_delta", index: 0, id: callId, name: "show", arguments: "" };
		yield { type: "tool_call_delta", index: 0, arguments: args };
		yield { type: "done", finishReason: "tool_calls", usage: null };
	},

	async complete() {
		return { text: "" };
	},

	async ping() {
		return { ok: true as const };
	},
};

// ── 复用 repl.ts 的初始化流程 ──

const baseSystemPrompt = buildCodeSystemPrompt(
	getPrompt(),
	mockClient.modelId,
);

const initSkills = await loadInitSkills();
const systemMessage: DomainMessage = {
	type: "system_with_skill",
	content: baseSystemPrompt,
	skills: initSkills.map(toSkill),
};

const toolsConfig = buildToolsConfig(
	{
		max_iterations: 1,
		max_idle_rounds: 1,
		default_exec_waitfor: 20,
		max_exec_output_tokens: 32_000,
	},
	{ blocked_commands: [] },
	{ workspace, sessionDir },
);

const toolkit = makeToolkit(showConfig, toolsConfig, mockClient.modelId);

const envContext = await buildEnvironmentContext(workspace);

const history: DomainMessage[] = [
	systemMessage,
	{ type: "cache_breakpoint" } as DomainMessage,
	{
		type: "user_input",
		content: userMessage,
		context: envContext || null,
		hint: CODE_TAIL_ANCHOR,
		mentionedSkills: [],
	},
];

// ── 驱动 agentLoop ──

await agentLoop(history, {
	client: mockClient,
	toolkit,
	maxIterations: 1,
	renderer: new PlainRenderer(),
	confirmFn: async () => "y",
});

if (!captured) {
	console.error("ERROR: mock client was never called — no request captured.");
	process.exit(1);
}

// ── DomainMessage → PromptMessage → OpenAI 格式 ──

const promptMessages = formatPrompt(captured.messages, tags);
const toolDefs = captured.tools;

interface OpenAIMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string | null;
	reasoning_content?: string | null;
	tool_calls?: Array<{
		id: string;
		type: "function";
		function: { name: string; arguments: string };
	}>;
	tool_call_id?: string;
}

function toOpenAIMessages(
	msgs: typeof promptMessages,
): OpenAIMessage[] {
	const result: OpenAIMessage[] = [];
	for (const msg of msgs) {
		switch (msg.role) {
			case "system":
				result.push({ role: "system", content: msg.content });
				break;
			case "user":
				result.push({ role: "user", content: msg.content });
				break;
			case "assistant": {
				if (msg.toolCalls?.length) {
					result.push({
						role: "assistant",
						content: msg.content || null,
						reasoning_content: msg.reasoning.ok ? msg.reasoning.value : undefined,
						tool_calls: msg.toolCalls.map((tc) => ({
							id: tc.id,
							type: "function" as const,
							function: {
								name: tc.tool,
								arguments: JSON.stringify(tc.args),
							},
						})),
					});
				} else {
					result.push({
						role: "assistant",
						content: msg.content || null,
						reasoning_content: msg.reasoning.ok ? msg.reasoning.value : undefined,
					});
				}
				break;
			}
			case "tool":
				result.push({
					role: "tool",
					content: msg.content,
					tool_call_id: msg.toolCallId,
				});
				break;
		}
	}
	return result;
}

function toOpenAITools(tools: ToolDefinition[]) {
	return tools.map((t) => ({
		type: "function" as const,
		function: {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		},
	}));
}

const openaiMessages = toOpenAIMessages(promptMessages);
const openaiTools = toOpenAITools(toolDefs);

const output = {
	messages: openaiMessages,
	tools: openaiTools,
	add_generation_prompt: true,
	enable_thinking: true,
};

// ── 写入 ──

const outDir = resolve(outPath, "..");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, JSON.stringify(output, null, 2), "utf-8");

console.log(`Request JSON written to: ${outPath}`);
console.log(`  messages: ${openaiMessages.length}`);
console.log(`  tools: ${openaiTools.length}`);
