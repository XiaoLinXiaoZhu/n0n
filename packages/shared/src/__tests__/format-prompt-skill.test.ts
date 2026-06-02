/**
 * formatPrompt skill 注入集成测试
 *
 * 验证 skill 在两个注入点的拼装：
 * 1. system_with_skill — 主提示词 + 排序好的 init skills 拼成单条 system 消息
 * 2. user_input.mentionedSkills — 用户引用的 skill 拼接到用户消息正文之后、hint 之前
 */

import { describe, expect, test } from "bun:test";
import type { DomainMessage, Skill } from "@n0n/types";
import { formatPrompt } from "../format-prompt/index.ts";
import { createTagAdapter } from "../tags.ts";

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
			"You are an agent.\n\n<workflow>\n%% This is a skill %%\n\nread → implement → verify\n</workflow>",
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
		expect(content.indexOf("<a>")).toBeLessThan(content.indexOf("<b>"));
	});
});

describe("formatPrompt — user_input.mentionedSkills", () => {
	test("mentionedSkills 拼接到正文之后、hint 之前", () => {
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
		// 顺序：正文 → skill → hint
		const bodyIdx = content.indexOf("use this skill");
		const skillIdx = content.indexOf("<debug>");
		const hintIdx = content.indexOf("remember to verify");
		expect(bodyIdx).toBeGreaterThanOrEqual(0);
		expect(skillIdx).toBeGreaterThan(bodyIdx);
		expect(hintIdx).toBeGreaterThan(skillIdx);
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
		expect(out[0]?.content).toBe("plain message");
	});
});
