/**
 * deepseek-test-1 client 的 system_with_skill 拆分逻辑测试
 *
 * 验证特殊格式化行为：
 * - system_with_skill 拆为「纯文本 system」+「触发 prompt + skill 的 user 消息」
 * - skills 为空时不注入 user 消息
 * - 普通 system / 其他消息原样保留
 */

import { describe, expect, test } from "bun:test";
import { createTagAdapter } from "@n0n/shared";
import type { DomainMessage, Skill } from "@n0n/types";
import { splitSkillsToUser } from "../deepseek-test-1-client/index.ts";
import triggerPromptRaw from "../deepseek-test-1-client/trigger-prompt.md" with {
	type: "text",
};

const triggerPromptContent = triggerPromptRaw
	.replace(/<!--[\s\S]*?-->/g, "")
	.trim();

const tags = createTagAdapter("deepseek");

function mkSkill(name: string, body: string): Skill {
	return { name, body, scripts: [], resources: [] };
}

describe("splitSkillsToUser", () => {
	test("system_with_skill 拆为纯文本 system + 含触发 prompt 与 skill 的 user 消息", () => {
		const msgs: DomainMessage[] = [
			{
				type: "system_with_skill",
				content: "BASE SYSTEM",
				skills: [mkSkill("workflow", "read then verify")],
			},
		];
		const out = splitSkillsToUser(msgs, tags);

		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ type: "system", content: "BASE SYSTEM" });
		expect(out[1]?.type).toBe("generic_user_text");
		const userContent = (out[1] as { content: string }).content;
		expect(userContent.startsWith(triggerPromptContent)).toBe(true);
		expect(userContent).toContain("read then verify");
		// skill 正文不应残留在 system 中
		expect((out[0] as { content: string }).content).not.toContain(
			"read then verify",
		);
	});

	test("skills 为空时只产出纯文本 system，不注入 user 消息", () => {
		const msgs: DomainMessage[] = [
			{ type: "system_with_skill", content: "ONLY SYSTEM", skills: [] },
		];
		const out = splitSkillsToUser(msgs, tags);
		expect(out).toHaveLength(1);
		expect(out[0]).toEqual({ type: "system", content: "ONLY SYSTEM" });
	});

	test("普通 system 与其他消息原样保留", () => {
		const msgs: DomainMessage[] = [
			{ type: "system", content: "plain sys" },
			{
				type: "user_input",
				content: "hi",
				context: null,
				hint: null,
				mentionedSkills: [],
			},
		];
		const out = splitSkillsToUser(msgs, tags);
		expect(out).toEqual(msgs);
	});

	test("多个 skill 全部进入同一个 user 消息", () => {
		const msgs: DomainMessage[] = [
			{
				type: "system_with_skill",
				content: "S",
				skills: [mkSkill("a", "AAA"), mkSkill("b", "BBB")],
			},
		];
		const out = splitSkillsToUser(msgs, tags);
		const userContent = (out[1] as { content: string }).content;
		expect(userContent).toContain("AAA");
		expect(userContent).toContain("BBB");
	});
});
