/**
 * show 类型、循环控制和模型适配的机制测试。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	buildCodeSystemPrompt,
	getCodeModelGuidance,
} from "../model-guidance.ts";
import { handleShowResult } from "../repl/handle-result.ts";
import { type CodeShowResult, CodeShowSchema } from "../schema.ts";
import {
	noCustomerParticipationShowConfig,
	showConfig,
} from "../show-config.ts";
import {
	CODE_SHOW_DEFINITIONS,
	CODE_SHOW_TYPES,
	isCodeTerminalShowType,
} from "../show-types.ts";
import { ShowWriter } from "../show-writer.ts";

const notifyConfig = { enabled: false } as const;

function handle(result: CodeShowResult) {
	const sessionDir = mkdtempSync(join(tmpdir(), "n0n-show-types-"));
	const outcome = handleShowResult(
		result,
		new ShowWriter(sessionDir),
		notifyConfig,
	);
	return { outcome, sessionDir };
}

describe("CodeShowSchema", () => {
	test("接受全部八种接口类型", () => {
		expect(showConfig.map((item) => item.value)).toEqual([...CODE_SHOW_TYPES]);
		expect(
			CODE_SHOW_DEFINITIONS.filter(
				(definition) => definition.lifecycle === "continue",
			),
		).toHaveLength(1);
		expect(
			CODE_SHOW_DEFINITIONS.filter(
				(definition) => definition.lifecycle === "wait",
			),
		).toHaveLength(3);
		expect(
			CODE_SHOW_DEFINITIONS.filter(
				(definition) => definition.lifecycle === "terminal",
			),
		).toHaveLength(4);
		for (const type of CODE_SHOW_TYPES) {
			expect(CodeShowSchema.safeParse({ type, content: "x" }).success).toBe(
				true,
			);
		}
	});

	test("拒绝旧 taxonomy", () => {
		for (const type of [
			"working log",
			"ask user question",
			"request user assistance",
			"revised-scope delivery",
			"blocked",
			"failed",
			"customer termination",
			"final report",
		]) {
			expect(CodeShowSchema.safeParse({ type, content: "x" }).success).toBe(
				false,
			);
		}
	});

	test("客户后续参与不可用时不暴露等待类型", () => {
		expect(noCustomerParticipationShowConfig.map((item) => item.value)).toEqual(
			[
				"production record",
				"qualified delivery",
				"production suspended",
				"production failed",
				"customer cancelled",
			],
		);
	});
});

describe("show 循环控制", () => {
	test("生产记录自动继续并持久化可见正文", () => {
		const { outcome, sessionDir } = handle({
			type: "production record",
			content: "形成新结论",
		});
		expect(outcome.action).toBe("auto_resume");
		if (outcome.action !== "auto_resume") return;
		expect(outcome.historyEntry.type).toBe("user_input");
		expect(readdirSync(sessionDir)).toContain("0001-production-record.md");
		expect(readFileSync(join(sessionDir, "current-show.md"), "utf8")).toContain(
			"形成新结论",
		);
	});

	test("三种客户请求均等待客户", () => {
		for (const type of [
			"customer information required",
			"customer decision required",
			"customer action required",
		] as const) {
			expect(handle({ type, content: "需要输入" }).outcome.action).toBe(
				"wait_for_customer",
			);
		}
	});

	test("四种质量终态均结束当前周期", () => {
		for (const type of CODE_SHOW_TYPES) {
			if (!isCodeTerminalShowType(type)) continue;
			expect(handle({ type, content: "终态" }).outcome.action).toBe("terminal");
		}
	});

	test("除生产记录外，三种等待和四种终态均触发通知", () => {
		let notifications = 0;
		const notify = () => {
			notifications++;
		};

		handleShowResult(
			{ type: "production record", content: "记录" },
			new ShowWriter(mkdtempSync(join(tmpdir(), "n0n-show-notify-"))),
			notifyConfig,
			notify,
		);
		expect(notifications).toBe(0);

		for (const type of CODE_SHOW_TYPES) {
			if (type === "production record") continue;
			handleShowResult(
				{ type, content: "消息" },
				new ShowWriter(mkdtempSync(join(tmpdir(), "n0n-show-notify-"))),
				notifyConfig,
				notify,
			);
		}
		expect(notifications).toBe(7);
	});

	test("只有客户决定请求解析选项 DSL", () => {
		const originalWrite = process.stderr.write;
		let output = "";
		process.stderr.write = ((chunk: string | Uint8Array) => {
			output += String(chunk);
			return true;
		}) as typeof process.stderr.write;

		try {
			for (const type of [
				"customer information required",
				"customer action required",
			] as const) {
				output = "";
				handle({
					type,
					content: "请处理\n## A\n详情",
				});
				expect(output).not.toContain("1) A");
			}

			output = "";
			handle({
				type: "customer decision required",
				content: "请选择\n## A\n详情",
			});
			expect(output).toContain("1) A");
		} finally {
			process.stderr.write = originalWrite;
		}
	});
});

describe("模型适配提示", () => {
	test("只为 DeepSeek 模型追加内部分析偏好", () => {
		expect(getCodeModelGuidance("deepseek-v4")).not.toBeNull();
		expect(getCodeModelGuidance("gpt-5")).toBeNull();
		expect(buildCodeSystemPrompt("base", "deepseek-v4")).toContain(
			"Model adapter preference",
		);
		expect(buildCodeSystemPrompt("base", "gpt-5")).toBe("base");
	});
});
