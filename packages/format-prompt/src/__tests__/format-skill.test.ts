/**
 * format-skill 单元测试
 *
 * 验证 Skill[] → 提示词文本的拼装（全程 wrapTag 精细包裹，body 不被改写）：
 * - 空列表返回空串
 * - 单 skill 以 <skill name="xxx"> 包裹标记行与正文，末尾带结束注释
 * - scripts / resources 以子标签嵌入，按需出现
 * - 多 skill 顺序保持
 * - skill body 内的 XML 片段原样保留（adaptTags 误用回归测试）
 */

import { describe, expect, test } from "bun:test";
import { createTagAdapter } from "@n0n/shared";
import type { Skill } from "@n0n/types";
import { formatSkills } from "../format-skill.ts";

const tags = createTagAdapter("default");

function mkSkill(overrides: Partial<Skill> = {}): Skill {
	return {
		name: "demo",
		body: "do the thing",
		scripts: [],
		resources: [],
		...overrides,
	};
}

describe("formatSkills", () => {
	test("空列表返回空串", () => {
		expect(formatSkills([], tags)).toBe("");
	});

	test('单 skill 以 <skill name="xxx"> 包裹标记行与正文，末尾带结束注释', () => {
		const out = formatSkills(
			[mkSkill({ name: "review", body: "review code" })],
			tags,
		);
		expect(out).toBe(
			'<skill name="review">\n<!-- begin of skill review -->\n\nreview code\n\n<!-- end of skill review -->\n</skill>',
		);
	});

	test("scripts 非空时以 scripts 子标签嵌入", () => {
		const out = formatSkills(
			[mkSkill({ scripts: ["run.sh", "check.py"] })],
			tags,
		);
		expect(out).toContain("<scripts>\nrun.sh\ncheck.py\n</scripts>");
		// 子标签嵌在 skill 标签内部
		expect(out.indexOf("<scripts>")).toBeGreaterThan(
			out.indexOf('<skill name="demo">'),
		);
		expect(out.indexOf("</scripts>")).toBeLessThan(out.indexOf("</skill>"));
	});

	test("resources 非空时以 resources 子标签嵌入", () => {
		const out = formatSkills([mkSkill({ resources: ["data.json"] })], tags);
		expect(out).toContain("<resources>\ndata.json\n</resources>");
	});

	test("scripts/resources 均为空时不输出对应子标签", () => {
		const out = formatSkills([mkSkill()], tags);
		expect(out).not.toContain("<scripts>");
		expect(out).not.toContain("<resources>");
	});

	test("多 skill 按传入顺序拼接，以空行分隔", () => {
		const out = formatSkills(
			[
				mkSkill({ name: "first", body: "A" }),
				mkSkill({ name: "second", body: "B" }),
			],
			tags,
		);
		expect(out).toBe(
			'<skill name="first">\n<!-- begin of skill first -->\n\nA\n\n<!-- end of skill first -->\n</skill>\n\n' +
				'<skill name="second">\n<!-- begin of skill second -->\n\nB\n\n<!-- end of skill second -->\n</skill>',
		);
	});

	test("body 内的 XML 片段原样保留，不被标签适配误改", () => {
		const out = formatSkills(
			[mkSkill({ name: "html", body: "use <div> and </span> here" })],
			tags,
		);
		// body 中的 <div> / </span> 必须原样保留
		expect(out).toContain("use <div> and </span> here");
	});
});
