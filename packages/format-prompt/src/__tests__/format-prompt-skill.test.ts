/**
 * formatPrompt skill 注入集成测试
 *
 * 验证 skill 在两个注入点的拼装：
 * 1. system_with_skill — 主提示词 + 排序好的 init skills 拼成单条 system 消息
 * 2. user_input.mentionedSkills — 用户引用的 skill 拼接到 user-request 之前、hint 之前
 */

import { describe, expect, test } from "bun:test";
import { createTagAdapter } from "@n0n/shared";
import type { DomainMessage, Skill } from "@n0n/types";
import { formatPrompt } from "../index.ts";

const tags = createTagAdapter("default");

function mkSkill(name: string, body: string): Skill {
	return { name, body, scripts: [], resources: [] };
}

describe("formatPrompt — system_with_skill", () => {
	test("content 与 skills 拼成单条 system 消息", () => {
		const msgs: DomainMessage[] = [
			{
				type: "system_with_skill",
				content: "You are an agent.",
				skills: [mkSkill("workflow", "read → implement → verify")],
			},
		];
		const out = formatPrompt(msgs, tags);
		expect(out).toHaveLength(1);
		expect(out[0]?.role).toBe("system");
		expect(out[0]?.content).toBe(
			'You are an agent.\n\n<skill name="workflow">\n<!-- begin of skill workflow -->\n\nread → implement → verify\n\n<!-- end of skill workflow -->\n</skill>',
		);
	});

	test("skills 为空时只输出主提示词", () => {
		const msgs: DomainMessage[] = [
			{ type: "system_with_skill", content: "Base prompt.", skills: [] },
		];
		const out = formatPrompt(msgs, tags);
		expect(out[0]?.content).toBe("Base prompt.");
	});

	test("多个 skill 按传入顺序拼接", () => {
		const msgs: DomainMessage[] = [
			{
				type: "system_with_skill",
				content: "Sys.",
				skills: [mkSkill("a", "AAA"), mkSkill("b", "BBB")],
			},
		];
		const out = formatPrompt(msgs, tags);
		const content = out[0]?.content ?? "";
		expect(content.indexOf('<skill name="a">')).toBeLessThan(
			content.indexOf('<skill name="b">'),
		);
	});
});

describe("formatPrompt — user_input.mentionedSkills", () => {
	test("mentionedSkills 拼接到 user-request 之前、hint 之前", () => {
		const msgs: DomainMessage[] = [
			{
				type: "user_input",
				content: "use this skill",
				context: null,
				hint: "remember to verify",
				mentionedSkills: [mkSkill("debug", "step through")],
			},
		];
		const out = formatPrompt(msgs, tags);
		expect(out).toHaveLength(1);
		const content = out[0]?.content ?? "";
		// 顺序：skill → user-request → hint
		const skillIdx = content.indexOf('<skill name="debug">');
		const reqIdx = content.indexOf("<user-request>");
		const hintIdx = content.indexOf("remember to verify");
		expect(skillIdx).toBeGreaterThanOrEqual(0);
		expect(reqIdx).toBeGreaterThan(skillIdx);
		expect(hintIdx).toBeGreaterThan(reqIdx);
	});

	test("context 排在 skill 之前", () => {
		const msgs: DomainMessage[] = [
			{
				type: "user_input",
				content: "do something",
				context: "project info here",
				hint: null,
				mentionedSkills: [mkSkill("review", "check code")],
			},
		];
		const out = formatPrompt(msgs, tags);
		const content = out[0]?.content ?? "";
		// 顺序：context → skill → user-request
		const ctxIdx = content.indexOf("<context>");
		const skillIdx = content.indexOf('<skill name="review">');
		const reqIdx = content.indexOf("<user-request>");
		expect(ctxIdx).toBeGreaterThanOrEqual(0);
		expect(skillIdx).toBeGreaterThan(ctxIdx);
		expect(reqIdx).toBeGreaterThan(skillIdx);
	});

	test("mentionedSkills 为空时不注入 skill 块", () => {
		const msgs: DomainMessage[] = [
			{
				type: "user_input",
				content: "plain message",
				context: null,
				hint: null,
				mentionedSkills: [],
			},
		];
		const out = formatPrompt(msgs, tags);
		expect(out[0]?.content).toBe(
			"<user-request>\nplain message\n</user-request>",
		);
	});
});
