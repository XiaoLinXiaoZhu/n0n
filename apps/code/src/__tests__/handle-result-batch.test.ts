/**
 * handleShowResults — 同一轮多个 show 的顺序处理与循环控制聚合。
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { NotifyConfig } from "../notify-sound.ts";
import { handleShowResults } from "../repl/handle-result.ts";
import type { CodeShowResult } from "../schema.ts";
import { ShowWriter } from "../show-writer.ts";

const notifyConfig: NotifyConfig = { enabled: false };

function makeSessionDir(): string {
	return mkdtempSync(join(tmpdir(), "n0n-handle-results-"));
}

function run(results: CodeShowResult[], sessionDir: string) {
	let notifications = 0;
	const outcome = handleShowResults(
		results,
		new ShowWriter(sessionDir),
		notifyConfig,
		() => {
			notifications++;
		},
	);
	return { outcome, notifications };
}

describe("handleShowResults", () => {
	test("全部为生产记录时只注入一次自动继续提示", () => {
		const sessionDir = makeSessionDir();
		const { outcome, notifications } = run(
			[
				{ type: "production record", content: "第一条" },
				{ type: "production record", content: "第二条" },
			],
			sessionDir,
		);

		expect(outcome.action).toBe("auto_resume");
		expect(notifications).toBe(0);
		expect(readdirSync(sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-production-record.md",
				"current-show.md",
			]),
		);
		expect(readFileSync(join(sessionDir, "current-show.md"), "utf8")).toContain(
			"第二条",
		);
	});

	test("生产记录与终态同轮时终态优先并全部持久化", () => {
		const sessionDir = makeSessionDir();
		const { outcome, notifications } = run(
			[
				{ type: "production record", content: "过程" },
				{ type: "qualified delivery", content: "交付" },
			],
			sessionDir,
		);

		expect(outcome.action).toBe("terminal");
		expect(notifications).toBe(1);
		expect(readdirSync(sessionDir)).toEqual(
			expect.arrayContaining([
				"0001-production-record.md",
				"0002-qualified-delivery.md",
			]),
		);
		expect(readFileSync(join(sessionDir, "current-show.md"), "utf8")).toContain(
			"交付",
		);
	});

	test("生产记录与等待请求同轮时等待优先", () => {
		const sessionDir = makeSessionDir();
		const { outcome, notifications } = run(
			[
				{ type: "production record", content: "过程" },
				{ type: "customer information required", content: "需要信息" },
			],
			sessionDir,
		);

		expect(outcome.action).toBe("wait_for_customer");
		expect(notifications).toBe(1);
	});

	test("终态与等待请求同轮时终态优先", () => {
		const sessionDir = makeSessionDir();
		const { outcome, notifications } = run(
			[
				{ type: "customer decision required", content: "需要决定" },
				{ type: "production suspended", content: "暂停" },
			],
			sessionDir,
		);

		expect(outcome.action).toBe("terminal");
		expect(notifications).toBe(2);
	});

	test("空结果抛出错误", () => {
		expect(() => run([], makeSessionDir())).toThrow(
			"handleShowResults requires at least one show result",
		);
	});
});
