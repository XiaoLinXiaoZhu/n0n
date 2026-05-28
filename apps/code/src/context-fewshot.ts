/**
 * context-fewshot — Bootstrap 教学场景
 *
 * 通过 CLI 工具 (n0n-init, n0n-skill) 获取环境信息，
 * fewshot 只负责行为教学：
 *   - 多路并行工具调用（递进：4路 → blocked → 7路 → 2路）
 *   - progress 三种状态（working / blocked / completed）
 *   - write/edit/exec 确定性工具不等待同批发出
 *   - CLI 工具使用模式
 *
 * 4 assistant turns 教学流程：
 * Turn 1: n0n-init global + project + n0n-skill + progress(working) — 多路并行
 * Turn 2: progress(blocked) 索取验证任务 — 教 blocked 用法
 * Turn 3: 2×write + 2×edit + 2×observe + progress(working) — 混合工具同批不等待
 * Turn 4: act(清理) + progress(completed) — 收尾 + 结构化汇报
 */

import type { Toolkit } from "@n0n/tools";
import type {
	ActToolCall,
	DomainMessage,
	EditToolCall,
	ObserveToolCall,
	ProgressToolCall,
	ProgressToolResult,
	ToolCallRecord,
	ToolResult,
	ToolStreamEvent,
	WriteToolCall,
} from "@n0n/types";

// ── Slot 类型 ──

interface ScriptSlot {
	_slot: "script";
	call: ObserveToolCall | ActToolCall;
}

interface DerivedSlot {
	_slot: "derived";
	build: (ctx: RuntimeCtx) => DomainMessage;
}

type FewshotEntry = DomainMessage | ScriptSlot | DerivedSlot;

interface RuntimeCtx {
	results: Map<string, ToolResult>;
	workspace: string;
}

const IS_WINDOWS = process.platform === "win32";

// ════════════════════════════════════════════════════════════════
// ██  TOOL CALLS 定义
// ════════════════════════════════════════════════════════════════

// ── Turn 1: 环境发现（4 并行）──

const INIT_GLOBAL: ObserveToolCall = {
	id: "init_global",
	tool: "observe",
	args: { script: "n0n-init global" },
};

const INIT_PROJECT: ObserveToolCall = {
	id: "init_project",
	tool: "observe",
	args: { script: "n0n-init project" },
};

const SKILL_LIST: ObserveToolCall = {
	id: "skill_list",
	tool: "observe",
	args: { script: IS_WINDOWS ? "n0n-skill" : "n0n-skill" },
};

const WORKING_1: ProgressToolCall = {
	id: "working_1",
	tool: "progress",
	args: {
		status: "working",
		content: "正在收集环境信息和可用技能...",
	},
};

// ── Turn 2: 索取验证任务 ──

const BLOCKED_TASK: ProgressToolCall = {
	id: "blocked_task",
	tool: "progress",
	args: {
		status: "blocked",
		content:
			"环境信息已收集完毕。system-reminder 提到有启动验证任务，请提供具体任务内容。",
	},
};

// ── Turn 3: 验证任务执行（7 并行）──

const WRITE_HELLO: ToolCallRecord = {
	id: "w_hello",
	tool: "write" as const,
	args: { path: ".temp/hello.ts", content: 'console.log("Hello n0n");\n' },
};

const WRITE_TEST: ToolCallRecord = {
	id: "w_test",
	tool: "write" as const,
	args: { path: ".temp/test.md", content: "# Test\nStatus: PENDING\n" },
};

const EDIT_TEST: ToolCallRecord = {
	id: "e_test",
	tool: "edit" as const,
	args: { path: ".temp/test.md", intent: "Change Status from PENDING to DONE" },
};

const EDIT_HELLO: ToolCallRecord = {
	id: "e_hello",
	tool: "edit" as const,
	args: {
		path: ".temp/hello.ts",
		intent: 'Change "Hello n0n" to "Hello World"',
	},
};

const OBSERVE_HELLO: ObserveToolCall = {
	id: "x_hello",
	tool: "observe",
	args: { script: IS_WINDOWS ? "bun .temp/hello.ts" : "bun .temp/hello.ts" },
};

const OBSERVE_TEST: ObserveToolCall = {
	id: "x_test",
	tool: "observe",
	args: {
		script: IS_WINDOWS ? "type .temp\\test.md" : "cat .temp/test.md",
	},
};

const WORKING_2: ProgressToolCall = {
	id: "working_2",
	tool: "progress",
	args: {
		status: "working",
		content: "验证工具并行调用：同时写入、编辑、执行多个文件，不等待中间结果。",
	},
};

// ── Turn 4: 清理 + 提交 ──

const ACT_CLEANUP: ActToolCall = {
	id: "x_cleanup",
	tool: "act",
	args: {
		script: IS_WINDOWS
			? "del .temp\\hello.ts .temp\\test.md 2>nul & echo cleaned"
			: "rm -f .temp/hello.ts .temp/test.md && echo cleaned",
	},
};

// progress(completed) 是 derived — 依赖环境信息动态生成

// ════════════════════════════════════════════════════════════════
// ██  静态结果
// ════════════════════════════════════════════════════════════════

const WORKING_1_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "progress" as const,
	call: WORKING_1,
	cleanedResult: WORKING_1.args,
	userResponse: "继续",
} satisfies ProgressToolResult as DomainMessage;

const BLOCKED_TASK_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "progress" as const,
	call: BLOCKED_TASK,
	cleanedResult: BLOCKED_TASK.args,
	userResponse: [
		"验证任务如下：",
		"1. 我们的工具不会冲突，可按任意顺序调用",
		"2. 写入、编辑、执行等，可一次性并行调用",
		"3. 请验证各工具正常工作",
		"4. 完成后汇报环境状态和验证结果，然后等待实际请求",
	].join("\n"),
} satisfies ProgressToolResult as DomainMessage;

const WRITE_HELLO_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "write" as const,
	call: WRITE_HELLO as WriteToolCall,
	status: "completed" as const,
};

const WRITE_TEST_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "write" as const,
	call: WRITE_TEST as WriteToolCall,
	status: "completed" as const,
};

const EDIT_TEST_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "edit" as const,
	call: EDIT_TEST as EditToolCall,
	patches: [{ oldText: "Status: PENDING", newText: "Status: DONE" }],
	success: true,
	error: null,
	feedback: null,
	rounds: 1,
	durationMs: 600,
};

const EDIT_HELLO_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "edit" as const,
	call: EDIT_HELLO as EditToolCall,
	patches: [{ oldText: '"Hello n0n"', newText: '"Hello World"' }],
	success: true,
	error: null,
	feedback: null,
	rounds: 1,
	durationMs: 500,
};

const EXEC_HELLO_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "observe" as const,
	call: OBSERVE_HELLO,
	status: "completed" as const,
	exitCode: 0,
	stdout: "Hello World",
	stderr: "",
	durationMs: 80,
};

const EXEC_TEST_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "observe" as const,
	call: OBSERVE_TEST,
	status: "completed" as const,
	exitCode: 0,
	stdout: "# Test\nStatus: DONE",
	stderr: "",
	durationMs: 30,
};

const WORKING_2_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "progress" as const,
	call: WORKING_2,
	cleanedResult: WORKING_2.args,
	userResponse: "继续",
} satisfies ProgressToolResult as DomainMessage;

const ACT_CLEANUP_RESULT: DomainMessage = {
	type: "tool_result",
	tool: "act" as const,
	call: ACT_CLEANUP,
	status: "completed" as const,
	exitCode: 0,
	stdout: "cleaned",
	stderr: "",
	durationMs: 50,
};

// ════════════════════════════════════════════════════════════════
// ██  派生消息构建器
// ════════════════════════════════════════════════════════════════

function buildCompletedCall(ctx: RuntimeCtx): DomainMessage {
	const globalOut = extractStdout(ctx.results.get("init_global"));
	const projectOut = extractStdout(ctx.results.get("init_project"));
	const skillOut = extractStdout(ctx.results.get("skill_list"));

	// 从输出中提取关键信息
	const os = globalOut.match(/\[OS\]\n(.+)/)?.[1] ?? process.platform;
	const branch = projectOut.match(/Branch: (.+)/)?.[1] ?? "unknown";
	const workspace =
		projectOut.match(/\[Workspace\]\n(.+)/)?.[1] ?? ctx.workspace;
	const fileInfo = projectOut.match(/Source files: (\d+)/)?.[1] ?? "?";
	const lineInfo = projectOut.match(/Total lines: (.+)/)?.[1] ?? "?";
	const skills =
		skillOut
			.match(/ {2}(\w+) —/g)
			?.map((m) => m.match(/ {2}(\w+) —/)?.[1])
			.filter(Boolean)
			.join(", ") ?? "none";

	const content = [
		`环境初始化完成。`,
		`${os}，工作目录 ${workspace}，分支 ${branch}。`,
		`代码库：${fileInfo} 源文件，${lineInfo}。`,
		`可用 skills: ${skills}。`,
		``,
		`并行工具调用验证通过：write/edit/observe 可同批执行、互不等待。`,
		`收到实际请求后，我会结合环境信息判断是否有合适的 skill 可加载，然后执行任务。`,
	].join("\n");

	const call: ProgressToolCall = {
		id: "completed_final",
		tool: "progress",
		args: { status: "completed", content },
	};

	return {
		type: "assistant_tool_call",
		content: null,
		reasoning: {
			ok: true,
			value:
				"All tools verified working. Clean up temp files and submit the final completed report with environment summary.",
		},
		reasoningSignature: undefined,
		toolCalls: [ACT_CLEANUP, call],
	};
}

function buildCompletedResults(ctx: RuntimeCtx): DomainMessage[] {
	const globalOut = extractStdout(ctx.results.get("init_global"));
	const projectOut = extractStdout(ctx.results.get("init_project"));
	const skillOut = extractStdout(ctx.results.get("skill_list"));

	const os = globalOut.match(/\[OS\]\n(.+)/)?.[1] ?? process.platform;
	const branch = projectOut.match(/Branch: (.+)/)?.[1] ?? "unknown";
	const workspace =
		projectOut.match(/\[Workspace\]\n(.+)/)?.[1] ?? ctx.workspace;
	const fileInfo = projectOut.match(/Source files: (\d+)/)?.[1] ?? "?";
	const lineInfo = projectOut.match(/Total lines: (.+)/)?.[1] ?? "?";
	const skills =
		skillOut
			.match(/ {2}(\w+) —/g)
			?.map((m) => m.match(/ {2}(\w+) —/)?.[1])
			.filter(Boolean)
			.join(", ") ?? "none";

	const content = [
		`环境初始化完成。`,
		`${os}，工作目录 ${workspace}，分支 ${branch}。`,
		`代码库：${fileInfo} 源文件，${lineInfo}。`,
		`可用 skills: ${skills}。`,
		``,
		`并行工具调用验证通过：write/edit/observe 可同批执行、互不等待。`,
		`收到实际请求后，我会结合环境信息判断是否有合适的 skill 可加载，然后执行任务。`,
	].join("\n");

	const call: ProgressToolCall = {
		id: "completed_final",
		tool: "progress",
		args: { status: "completed", content },
	};

	return [
		ACT_CLEANUP_RESULT,
		{
			type: "tool_result",
			tool: "progress" as const,
			call,
			cleanedResult: call.args,
			userResponse: undefined,
		} satisfies ProgressToolResult as DomainMessage,
	];
}

// ════════════════════════════════════════════════════════════════
// ██  FEWSHOT TEMPLATE
// ════════════════════════════════════════════════════════════════

const FEWSHOT_TEMPLATE: FewshotEntry[] = [
	// ── User 请求 ──
	{
		type: "generic_user_text",
		content: [
			"<system-reminder>",
			"Bootstrap: use n0n-init to discover environment, n0n-skill to check available skills.",
			"1. Run `n0n-init global` and `n0n-init project` to get environment information.",
			"2. Run `n0n-skill` to see available skills",
			"3. Complete the bootstrap verification task which will be provided after you init",
			"4. Report via progress(completed)",
			"Note: The user cannot see your text responses — only progress results are delivered.",
			"</system-reminder>",
		].join("\n"),
	},

	// ── Turn 1: 4 并行（环境发现 + working）──
	{
		type: "assistant_tool_call",
		content: null,
		reasoning: {
			ok: true,
			value:
				"The system-reminder instructs me to run n0n-init and n0n-skill for environment discovery. I should call all three in parallel since they're independent, plus report progress.",
		},
		reasoningSignature: undefined,
		toolCalls: [INIT_GLOBAL, INIT_PROJECT, SKILL_LIST, WORKING_1],
	},

	{ _slot: "script", call: INIT_GLOBAL },
	{ _slot: "script", call: INIT_PROJECT },
	{ _slot: "script", call: SKILL_LIST },
	WORKING_1_RESULT,

	// ── Turn 2: progress(blocked) 索取验证任务 ──
	{
		type: "assistant_tool_call",
		content: null,
		reasoning: {
			ok: true,
			value:
				"Environment info collected. The system-reminder mentions a bootstrap verification task but hasn't provided specifics. I need to ask the user for the task details using progress(blocked).",
		},
		reasoningSignature: undefined,
		toolCalls: [BLOCKED_TASK],
	},

	BLOCKED_TASK_RESULT,

	// ── Turn 3: 7 并行（验证任务执行）──
	{
		type: "assistant_tool_call",
		content: null,
		reasoning: {
			ok: true,
			value:
				"The verification task requires demonstrating parallel tool calls. I'll create two files, edit both, execute both, and report progress — all in one batch to prove no conflicts.",
		},
		reasoningSignature: undefined,
		toolCalls: [
			WRITE_HELLO,
			WRITE_TEST,
			EDIT_TEST,
			EDIT_HELLO,
			OBSERVE_HELLO,
			OBSERVE_TEST,
			WORKING_2,
		],
	},

	WRITE_HELLO_RESULT,
	WRITE_TEST_RESULT,
	EDIT_TEST_RESULT,
	EDIT_HELLO_RESULT,
	EXEC_HELLO_RESULT,
	EXEC_TEST_RESULT,
	WORKING_2_RESULT,

	// ── Turn 4: 清理 + completed（derived）──
	{ _slot: "derived", build: buildCompletedCall },
	{
		_slot: "derived",
		build: (ctx) => buildCompletedResults(ctx)[0]!,
	},
	{
		_slot: "derived",
		build: (ctx) => buildCompletedResults(ctx)[1]!,
	},
];

// ════════════════════════════════════════════════════════════════
// ██  渲染器
// ════════════════════════════════════════════════════════════════

function isSlot(entry: FewshotEntry): entry is ScriptSlot | DerivedSlot {
	return "_slot" in entry;
}

async function runTool(
	toolkit: Toolkit,
	call: ObserveToolCall | ActToolCall,
): Promise<ToolResult> {
	// observe 和 act 共享同一个执行后端
	const entry = toolkit.getEntry(call.tool) ?? toolkit.getEntry("observe");
	if (!entry?.stream)
		throw new Error(`${call.tool} tool entry not found or not stream`);
	const gen = (
		entry.execute as (tc: ToolCallRecord) => AsyncGenerator<ToolStreamEvent>
	)(call);
	let result: ToolResult | undefined;
	for await (const event of gen) {
		if (event.type === "tool_result") result = event;
	}
	if (!result)
		throw new Error(`exec tool did not yield a result for call ${call.id}`);
	return result;
}

function extractStdout(result: ToolResult | undefined): string {
	if (!result) return "";
	const tool = result.tool;
	if (tool !== "observe" && tool !== "act") return "";
	if ("stdout" in result) return result.stdout;
	if ("stdoutSoFar" in result)
		return (result as { stdoutSoFar: string }).stdoutSoFar;
	if ("stdoutTail" in result)
		return (result as { stdoutTail: string }).stdoutTail;
	return "";
}

async function renderFewshot(
	template: FewshotEntry[],
	toolkit: Toolkit,
	workspace: string,
): Promise<DomainMessage[]> {
	// Execute all exec slots in parallel
	const scriptSlots = template.filter(
		(e): e is ScriptSlot => isSlot(e) && e._slot === "script",
	);
	const execResults = await Promise.all(
		scriptSlots.map((s) => runTool(toolkit, s.call)),
	);
	const resultMap = new Map<string, ToolResult>();
	for (let i = 0; i < scriptSlots.length; i++) {
		resultMap.set(scriptSlots[i]!.call.id, execResults[i]!);
	}

	const ctx: RuntimeCtx = { results: resultMap, workspace };

	// Render template
	return template.map((entry): DomainMessage => {
		if (!isSlot(entry)) return entry;
		if (entry._slot === "script") return resultMap.get(entry.call.id)!;
		return entry.build(ctx);
	});
}

// ── 对外接口 ──

export async function buildContextFewshot(
	toolkit: Toolkit,
	workspace: string,
	_tempDir?: string,
): Promise<DomainMessage[]> {
	return renderFewshot(FEWSHOT_TEMPLATE, toolkit, workspace);
}
