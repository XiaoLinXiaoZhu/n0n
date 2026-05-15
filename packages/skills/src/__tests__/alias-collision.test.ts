/**
 * 边缘情况测试：别名冲突、同名 skill、名-别互撞
 *
 * 核心逻辑在 resolver（findSkillsByNameOrAlias）和 parser（deriveNameFromPath），
 * 测试聚焦查询匹配的正确性。
 */
import { describe, expect, it } from "bun:test";
import { findSkillsByNameOrAlias } from "../resolver.ts";
import { deriveNameFromPath } from "../parser.ts";
import type { SkillMeta, SkillCategory } from "../types.ts";

// ── 工厂 ──

function makeSkill(overrides: Partial<SkillMeta>): SkillMeta {
  return {
    uid: "test-uid",
    name: "default",
    alias: [],
    category: "task" as SkillCategory,
    description: "test",
    activation: "auto",
    order: 50,
    path: "/tmp/skills/task/default/SKILL.md",
    dir: "/tmp/skills/task/default",
    ...overrides,
  };
}

// ── 测试 ──

describe("findSkillsByNameOrAlias", () => {
  it("按名称精确匹配", () => {
    const skills = [makeSkill({ name: "bugfix" })];
    expect(findSkillsByNameOrAlias(skills, "bugfix")).toHaveLength(1);
  });

  it("按别名精确匹配", () => {
    const skills = [makeSkill({ name: "bugfix", alias: ["fix"] })];
    expect(findSkillsByNameOrAlias(skills, "fix")).toHaveLength(1);
  });

  it("查询不存在的名称返回空数组", () => {
    const skills = [makeSkill({ name: "bugfix" })];
    expect(findSkillsByNameOrAlias(skills, "nonexistent")).toHaveLength(0);
  });

  it("空 skills 数组返回空数组", () => {
    expect(findSkillsByNameOrAlias([], "anything")).toHaveLength(0);
  });

  describe("同名冲突 — 不同分类下的同名目录", () => {
    it("两个同名的 skill 都应返回", () => {
      const skills = [
        makeSkill({ name: "my-skill", category: "task" }),
        makeSkill({ name: "my-skill", category: "standard" }),
      ];
      const matched = findSkillsByNameOrAlias(skills, "my-skill");
      expect(matched).toHaveLength(2);
      expect(matched.map((s) => s.category).sort()).toEqual([
        "standard",
        "task",
      ]);
    });

    it("一个同名、一个不同名 → 只返回同名者", () => {
      const skills = [
        makeSkill({ name: "shared-name", category: "task" }),
        makeSkill({ name: "other", category: "standard" }),
      ];
      expect(findSkillsByNameOrAlias(skills, "shared-name")).toHaveLength(1);
    });
  });

  describe("别名冲突 — 多个 skill 共享同一别名", () => {
    it("两个 skill 有相同别名，按别名查询应返回两者", () => {
      const skills = [
        makeSkill({ name: "skill-a", alias: ["hotfix"] }),
        makeSkill({ name: "skill-b", alias: ["hotfix"] }),
      ];
      const matched = findSkillsByNameOrAlias(skills, "hotfix");
      expect(matched).toHaveLength(2);
      expect(matched.map((s) => s.name).sort()).toEqual(["skill-a", "skill-b"]);
    });

    it("别名匹配不影响名称匹配", () => {
      const skills = [
        makeSkill({ name: "skill-a", alias: ["hotfix"] }),
        makeSkill({ name: "hotfix" }),
      ];
      // 查询 "hotfix" → 匹配名称 skill-b (1) + 别名 skill-a (1) = 2
      expect(findSkillsByNameOrAlias(skills, "hotfix")).toHaveLength(2);
    });
  });

  describe("名-别互撞 — 一个 skill 的名称是另一个的别名", () => {
    it("查询词同时匹配名称和别名时，所有命中都应返回", () => {
      const skills = [
        makeSkill({ name: "quick-fix" }),
        makeSkill({ name: "hotfix", alias: ["quick-fix"] }),
      ];
      const matched = findSkillsByNameOrAlias(skills, "quick-fix");
      expect(matched).toHaveLength(2);
      expect(matched.map((s) => s.name).sort()).toEqual(["hotfix", "quick-fix"]);
    });
  });
});

describe("deriveNameFromPath", () => {
  it("单级路径推导单段 name", () => {
    const name = deriveNameFromPath(
      "/skills/standard/coding/SKILL.md",
      "/skills/standard",
    );
    expect(name).toBe("coding");
  });

  it("多级路径推导连字符 name", () => {
    const name = deriveNameFromPath(
      "/skills/task/review/init/SKILL.md",
      "/skills/task",
    );
    expect(name).toBe("review-init");
  });

  it("Windows 反斜杠路径正规划", () => {
    const name = deriveNameFromPath(
      "C:\\skills\\task\\review\\init\\SKILL.md",
      "C:\\skills\\task",
    );
    expect(name).toBe("review-init");
  });
});
