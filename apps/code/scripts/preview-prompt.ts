/**
 * preview-prompt.ts — 端到端预览 Code Agent 的系统提示词和 fewshot 对话
 *
 * 通过注入 mock LLMClient 驱动真实的初始化流程（loadInitSkills + buildEnvironmentContext）
 * 和 agentLoop，在 mock client 的 stream() 中截获完整请求（DomainMessage[] + tools），
 * 格式化为可读 markdown，输出到 git 跟踪的固定位置。
 *
 * 与直接拼装不同，这里经过了和生产环境完全一致的代码路径：
 *   getPrompt → loadInitSkills → makeToolkit → buildEnvironmentContext → agentLoop → client.stream()
 *
 * 用法：
 *   bun run apps/code/scripts/preview-prompt.ts
 *   bun run apps/code/scripts/preview-prompt.ts --user "修复登录 bug"
 */

import { resolve } from "node:path";
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import {
	createTagAdapter,
	formatPrompt,
} from "@n0n/shared";
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
	PromptMessage,
	ToolDefinition,
	TagAdapter,
} from "@n0n/types";

import { getPrompt } from "../src/prompts/index.ts";
import { buildEnvironmentContext } from "../src/context-env.ts";
import { codeProgressConfig } from "../src/progress-config.ts";

// ── CLI 参数 ──

function getArg(name: string, fallback: string): string {
	const idx = process.argv.indexOf(name);
	return idx !== -1 && process.argv[idx + 1] ? process.argv[idx + 1]! : fallback;
}

const userMessage = getArg(
	"--user",
	"项目里的 auth 模块最近频繁报 token 过期，帮我排查一下原因，如果能修就顺手修了。",
);

// ── 输出路径（git 跟踪） ──

const workspace = process.cwd();
const previewDir = resolve(workspace, "apps/code/scripts");
const outPath = resolve(previewDir, "PREVIEW.md");

// ── Mock LLMClient ──
// 截获 agentLoop 发来的第一次 stream() 请求，导出后用 progress(completed) 结束循环。

interface CapturedRequest {
	messages: DomainMessage[];
	tools: ToolDefinition[];
}

let captured: CapturedRequest | null = null;

const tags: TagAdapter = createTagAdapter("default");

const mockClient: LLMClient = {
	modelId: "mock-preview",
	tagStyle: "default",
	tags,

	async *stream(request: StreamRequest): AsyncGenerator<StreamEvent> {
		// structuredClone 避免 agentLoop 后续 push 污染截获的快照
		captured = {
			messages: structuredClone(request.messages),
			tools: request.tools ?? [],
		};

		// 返回一个 progress(completed) 工具调用，让 agentLoop 正常结束
		const callId = "preview_done";
		const args = JSON.stringify({
			status: "completed",
			content: "Preview capture complete.",
		});

		// tool_call_delta: 先发 name，再发 arguments，最后 done
		yield { type: "tool_call_delta", index: 0, id: callId, name: "progress", arguments: "" };
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

// ── 复用 repl.ts 的完整初始化流程 ──
// 以下代码与 repl.ts startCodeRepl 中的初始化部分保持一致

const baseSystemPrompt = getPrompt();

const initSkills = await loadInitSkills();
const systemMessage: DomainMessage = {
	type: "system_with_skill",
	content: baseSystemPrompt,
	skills: initSkills.map(toSkill),
};

const tempDir = resolve(workspace, ".temp");
const toolsConfig = buildToolsConfig(
	{
		type: "str-replace",
		editorClient: mockClient, // edit 工具不会被调用
	},
	{ maxIterations: 1, maxIdleRounds: 1, defaultExecWaitfor: 120 },
	{ blockedCommands: [] },
	{ workspace, tempDir },
);

const toolkit = makeToolkit(codeProgressConfig, toolsConfig, mockClient.modelId);

const envContext = buildEnvironmentContext(workspace);

const history: DomainMessage[] = [
	systemMessage,
	{ type: "cache_breakpoint" } as DomainMessage,
	{ type: "user_input", content: userMessage, context: envContext || null, hint: null, mentionedSkills: [] },
];

// ── 驱动 agentLoop — mock client 在第一次 stream() 时截获请求 ──

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

// ── 渲染 preview markdown ──

// DomainMessage → PromptMessage（与真实 client 内部转换一致）
const promptMessages = formatPrompt(captured.messages, tags);
const toolDefs = captured.tools;

function toolCallSummary(msg: PromptMessage & { role: "assistant" }): string {
	if (!msg.toolCalls?.length) return "";
	return msg.toolCalls
		.map((tc) => {
			const argsStr = JSON.stringify(tc.args, null, 2);
			const truncated =
				argsStr.length > 300
					? `${argsStr.slice(0, 300)}\n  ...`
					: argsStr;
			return `  - **${tc.tool}** (id: ${tc.id})\n    \`\`\`json\n    ${truncated.replace(/\n/g, "\n    ")}\n    \`\`\``;
		})
		.join("\n");
}

const sections: string[] = [];

sections.push("# Code Agent — System Prompt & Fewshot Preview");
sections.push(
	"> Captured via mock client through real agentLoop. Regenerate: `bun run apps/code/scripts/preview-prompt.ts`",
);
sections.push("");

// 工具定义摘要
sections.push(`## Tool Definitions (${toolDefs.length} tools)`);
sections.push("");
for (const t of toolDefs) {
	const descPreview = t.description.slice(0, 120).replace(/\n/g, " ");
	const paramKeys = Object.keys(t.parameters.properties ?? {});
	sections.push(
		`- **${t.name}**(${paramKeys.join(", ")}): ${descPreview}...`,
	);
}
sections.push("");

// Token 统计
let totalChars = 0;
const msgStats: { role: string; label: string; chars: number }[] = [];

for (const msg of promptMessages) {
	let chars = msg.content.length;
	let label = "";

	if (msg.role === "tool") {
		label = `tool [${msg.toolName}]`;
	} else if (
		msg.role === "assistant" &&
		"toolCalls" in msg &&
		msg.toolCalls?.length
	) {
		label = `assistant → [${msg.toolCalls.map((tc) => tc.tool).join(", ")}]`;
		chars += JSON.stringify(msg.toolCalls).length;
	} else {
		label = msg.role;
	}

	msgStats.push({ role: msg.role, label, chars });
	totalChars += chars;
}

sections.push(
	`## Message Sequence (${promptMessages.length} messages, ~${Math.round(totalChars / 4)} tokens)`,
);
sections.push("");
sections.push("| # | Role | Approx Tokens | Chars |");
sections.push("|---|------|--------------|-------|");
for (let i = 0; i < msgStats.length; i++) {
	const s = msgStats[i]!;
	sections.push(
		`| ${i + 1} | ${s.label} | ~${Math.round(s.chars / 4)} | ${s.chars.toLocaleString()} |`,
	);
}
sections.push("");

// Token 预算分解
const systemFormatted = formatPrompt([systemMessage], tags);
const systemChars = systemFormatted.reduce((n, m) => n + m.content.length, 0);
const toolDefChars = toolDefs.reduce(
	(s, t) => s + t.description.length + JSON.stringify(t.parameters).length,
	0,
);
const envContextChars = envContext?.length ?? 0;

sections.push("## Token Budget Breakdown");
sections.push("");
sections.push("| Component | Approx Tokens | Chars |");
sections.push("|-----------|--------------|-------|");
sections.push(
	`| System prompt | ~${Math.round(systemChars / 4).toLocaleString()} | ${systemChars.toLocaleString()} |`,
);
sections.push(
	`| Tool definitions | ~${Math.round(toolDefChars / 4).toLocaleString()} | ${toolDefChars.toLocaleString()} (${toolDefs.length} tools) |`,
);
sections.push(
	`| Environment context | ~${Math.round(envContextChars / 4)} | ${envContextChars.toLocaleString()} |`,
);
sections.push(
	`| User input | ~${Math.round(userMessage.length / 4)} | ${userMessage.length} |`,
);
sections.push(
	`| **Total prefix** | **~${Math.round(totalChars / 4).toLocaleString()}** | **${totalChars.toLocaleString()}** |`,
);
sections.push("");

// Init skills 清单
sections.push("## Init Skills");
sections.push("");
sections.push("| Order | Name |");
sections.push("|-------|------|");
for (const s of initSkills) {
	sections.push(`| ${s.order} | ${s.name} |`);
}
sections.push("");

// 分割线后逐条输出完整消息内容
sections.push("---");
sections.push("");

for (let i = 0; i < promptMessages.length; i++) {
	const msg = promptMessages[i]!;
	const stat = msgStats[i]!;

	sections.push(
		`## [${i + 1}/${promptMessages.length}] ${stat.label}`,
	);
	sections.push("");

	if (
		msg.role === "assistant" &&
		"toolCalls" in msg &&
		msg.toolCalls?.length
	) {
		sections.push("**Tool Calls:**");
		sections.push(
			toolCallSummary(msg as PromptMessage & { role: "assistant" }),
		);
		sections.push("");
		if (msg.content) {
			sections.push("**Content:**");
		}
	}

	if (msg.role === "tool") {
		sections.push(
			`> tool_call_id: \`${msg.toolCallId}\`, tool: \`${msg.toolName}\``,
		);
		sections.push("");
	}

	const content = msg.content;
	if (content) {
		const fence = content.includes("```") ? "~~~~" : "```";
		sections.push(fence);
		sections.push(content);
		sections.push(fence);
	}

	sections.push("");
}

// ── 写入文件 ──

const output = sections.join("\n");
if (!existsSync(previewDir)) mkdirSync(previewDir, { recursive: true });
writeFileSync(outPath, output, "utf-8");

// ── 终端摘要 ──

console.log(`Preview written to: ${outPath}`);
console.log("");
console.log("Token budget breakdown (approx):");
console.log(
	`  System prompt:    ~${Math.round(systemChars / 4).toLocaleString()} tokens (${systemChars.toLocaleString()} chars)`,
);
console.log(
	`  Tool definitions: ~${Math.round(toolDefChars / 4).toLocaleString()} tokens (${toolDefs.length} tools)`,
);
console.log(
	`  Environment context: ~${Math.round(envContextChars / 4)} tokens (${envContextChars.toLocaleString()} chars)`,
);
console.log(
	`  User input:       ~${Math.round(userMessage.length / 4)} tokens`,
);
console.log("  ────────────────────────────");
console.log(
	`  Total prefix:     ~${Math.round(totalChars / 4).toLocaleString()} tokens (${totalChars.toLocaleString()} chars)`,
);
