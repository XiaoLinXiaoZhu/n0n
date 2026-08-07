import { describe, expect, test } from "bun:test";
import { parseSkillLocation } from "../commands/create.ts";

describe("parseSkillLocation", () => {
	test("将 CLI 路径解析为合法领域值", () => {
		expect(parseSkillLocation("task/review/init")).toEqual({
			category: "task",
			nameParts: ["review", "init"],
		});
	});

	test("拒绝未知 category", () => {
		expect(() => parseSkillLocation("unknown/example")).toThrow("无效的分类");
	});

	test("拒绝空名称段和非法名称", () => {
		expect(() => parseSkillLocation("task/")).toThrow("无效的名称段");
		expect(() => parseSkillLocation("task/my--skill")).toThrow("无效的名称段");
	});
});
