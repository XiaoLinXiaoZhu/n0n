/**
 * OutputWriter 单元测试
 *
 * 验证 customer 暂停与自然停止记录的持久化行为：
 * - 编号共享递增（customer 与 finished 同一序列，从 01 开始）
 * - 文件名取 slug，无 slug 退化为 kind；自然停止为 finished
 * - customer 记录含元数据头 + 模型文本 + 正文；finished 只含模型文本
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CustomerCompleted } from "@n0n/types";
import { lastAssistantText, OutputWriter } from "../output-writer.ts";

function makeCustomer(
	kind: CustomerCompleted["kind"],
	body: string,
	slug: string | null = null,
): CustomerCompleted {
	return {
		type: "tool_result",
		tool: "post",
		status: "completed",
		scheme: "customer",
		kind,
		slug,
		call: {
			id: `call-${kind}`,
			tool: "post",
			args: { uri: `customer://${kind}`, body },
		},
	};
}

function makeSessionDir(): string {
	return mkdtempSync(join(tmpdir(), "n0n-output-writer-"));
}

describe("OutputWriter", () => {
	test("customer 记录：slug 命名，编号从 01 开始", () => {
		const sessionDir = makeSessionDir();
		const writer = new OutputWriter(sessionDir);

		writer.writeCustomer(
			makeCustomer("question", "选哪个？", "choose-approach"),
			"我分析了两个方案。",
		);

		const files = readdirSync(join(sessionDir, "output"));
		expect(files).toEqual(["01-choose-approach.md"]);
		const content = readFileSync(
			join(sessionDir, "output", files[0] as string),
			"utf-8",
		);
		expect(content).toContain(
			"<!-- n0n output | customer://question/choose-approach | ",
		);
		expect(content).toContain("## 模型文本");
		expect(content).toContain("我分析了两个方案。");
		expect(content).toContain("## 正文");
		expect(content).toContain("选哪个？");
	});

	test("无 slug 时文件名退化为 kind", () => {
		const sessionDir = makeSessionDir();
		const writer = new OutputWriter(sessionDir);

		writer.writeCustomer(makeCustomer("form", "请填写配置"), null);

		const files = readdirSync(join(sessionDir, "output"));
		expect(files).toEqual(["01-form.md"]);
		// 模型文本缺失时仍保留结构
		const content = readFileSync(
			join(sessionDir, "output", files[0] as string),
			"utf-8",
		);
		expect(content).toContain("customer://form |");
		expect(content).toContain("## 正文");
	});

	test("customer 与 finished 共享递增编号序列", () => {
		const sessionDir = makeSessionDir();
		const writer = new OutputWriter(sessionDir);

		writer.writeCustomer(makeCustomer("question", "问题 1", "q1"), "文本 A");
		writer.writeFinished("任务完成。");
		writer.writeCustomer(makeCustomer("action_required", "操作 2"), "文本 B");

		const files = readdirSync(join(sessionDir, "output")).sort();
		expect(files).toEqual([
			"01-q1.md",
			"02-finished.md",
			"03-action_required.md",
		]);
	});

	test("finished 记录只有元数据头与模型文本", () => {
		const sessionDir = makeSessionDir();
		const writer = new OutputWriter(sessionDir);

		writer.writeFinished("重构完成，399 个测试通过。");

		const content = readFileSync(
			join(sessionDir, "output", "01-finished.md"),
			"utf-8",
		);
		expect(content).toContain("<!-- n0n output | finished | ");
		expect(content).toContain("重构完成，399 个测试通过。");
		expect(content).not.toContain("## 正文");
		expect(content).not.toContain("## 模型文本");
	});

	test("编号扫描目录已有文件接续（进程重启后）", () => {
		const sessionDir = makeSessionDir();
		new OutputWriter(sessionDir).writeFinished("第一轮");
		// 新 writer 模拟进程重启：编号从已有 max 扫描接续
		new OutputWriter(sessionDir).writeFinished("第二轮");

		const files = readdirSync(join(sessionDir, "output")).sort();
		expect(files).toEqual(["01-finished.md", "02-finished.md"]);
	});
});

describe("lastAssistantText", () => {
	test("取末条 assistant_text", () => {
		expect(
			lastAssistantText([
				{ type: "system", content: "sys" },
				{
					type: "assistant_text",
					content: "最终输出",
					reasoning: { ok: false },
					reasoningSignature: undefined,
				},
			]),
		).toBe("最终输出");
	});

	test("无 assistant_text 返回 null", () => {
		expect(lastAssistantText([{ type: "system", content: "sys" }])).toBeNull();
	});
});
