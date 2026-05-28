/**
 * config 模块测试
 *
 * 覆盖：合并、$VAR、extend、trace、错误处理
 *
 * 设计：默认值作为 ConfigSource 传入（"默认"），与"全局""项目"并列。
 * "默认" 源只提供顶层 settings 的默认值（strip_hint 等），
 * llm/editor 字段由全局/项目配置保证。
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import type { ConfigSource } from "../types.ts";

// ── zod schema ──

const llmSchema = z.object({
  type: z.string(),
  base_url: z.string().default(""),
  api_key: z.string(),
  model: z.string(),
  thinking: z.boolean().optional(),
  thinking_budget_tokens: z.number().optional(),
  thinking_effort: z.string().optional(),
  backend_provider: z.string().optional(),
  enable_thinking: z.boolean().optional(),
  edit_backend: z.string().optional(),
});

const settingsSchema = z.object({
  settings: z.object({
    strip_hint: z.boolean(),
    notify_sound: z.boolean(),
    notify_sound_path: z.string(),
    blocked_commands: z.array(z.string()),
    llm: llmSchema,
    editor: llmSchema,
  }),
});

/** 默认配置 — 只提供顶层 settings 回退值，不提供 llm/editor */
const DEFAULT_TOML = `
[settings]
strip_hint = true
notify_sound = false
notify_sound_path = ""
blocked_commands = []
`;

/** 最小可用的 llm + editor 桩 */
const LLM_EDITOR_STUB = `
[settings.llm]
type = "openai"
api_key = "sk-stub"
model = "stub"

[settings.editor]
type = "openai"
api_key = "sk-stub"
model = "stub"
`;

function makeSources(...tomls: string[]): ConfigSource[] {
  return [
    { name: "默认", content: DEFAULT_TOML },
    ...tomls.map((content, i) => ({
      name: i === 0 ? "全局" : "项目",
      content,
    })),
  ];
}

// ═══════════════════════════════════════════════
// 基本解析
// ═══════════════════════════════════════════════

describe("基本解析", () => {
  test("解析单个 TOML 源", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings]
strip_hint = false

[settings.llm]
type = "anthropic"
api_key = "sk-test"
model = "claude-opus-4-6"

[settings.editor]
type = "openai"
api_key = "sk-test-2"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.strip_hint).toBe(false);
    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.llm.api_key).toBe("sk-test");
    expect(result.data.settings.llm.model).toBe("claude-opus-4-6");
    expect(result.data.settings.editor.type).toBe("openai");
  });

  test("默认 source 填充顶层字段", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings.llm]
type = "anthropic"
api_key = "sk-test"
model = "claude-opus-4-6"

[settings.editor]
type = "openai"
api_key = "sk-test-2"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    // 默认值来自 "默认" source
    expect(result.data.settings.strip_hint).toBe(true);
    expect(result.data.settings.notify_sound).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// 多文件合并
// ═══════════════════════════════════════════════

describe("多文件合并", () => {
  test("后者覆盖前者", () => {
    const result = getConfig(settingsSchema, [
      { name: "默认", content: DEFAULT_TOML },
      {
        name: "全局",
        content: `
[settings.llm]
type = "anthropic"
api_key = "sk-global"
model = "claude-opus"

[settings.editor]
type = "openai"
api_key = "sk-global-ed"
model = "gpt-4o"
`,
      },
      {
        name: "项目",
        content: `
[settings.llm]
api_key = "sk-project"
model = "claude-sonnet"
`,
      },
    ], {});

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.api_key).toBe("sk-project");
    expect(result.data.settings.llm.model).toBe("claude-sonnet");
    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.editor.type).toBe("openai");
  });
});

// ═══════════════════════════════════════════════
// $VAR 解析
// ═══════════════════════════════════════════════

describe("$VAR 解析", () => {
  test("$VAR 从 envPool 解析", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings.llm]
type = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"

[settings.editor]
type = "openai"
api_key = "sk-test"
model = "gpt-4o"
`), { ANTHROPIC_KEY: "sk-from-env" });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.api_key).toBe("sk-from-env");
  });

  test("$VAR 未找到时返回错误", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings.llm]
type = "anthropic"
api_key = "$MISSING_KEY"
model = "claude-opus"

[settings.editor]
type = "openai"
api_key = "sk-test"
model = "gpt-4o"
`), {});

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.errors[0]!.kind).toBe("env_var_not_found");
  });

  test("$ 后非大写字母不触发解析", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings.llm]
type = "anthropic"
api_key = "$not_a_var"
model = "claude-opus"

[settings.editor]
type = "openai"
api_key = "sk-test"
model = "gpt-4o"
`), {});

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.data.settings.llm.api_key).toBe("$not_a_var");
  });
});

// ═══════════════════════════════════════════════
// extend 解析
// ═══════════════════════════════════════════════

describe("extend 解析", () => {
  test("settings.llm 通过 extend 引用 provider", () => {
    const result = getConfig(settingsSchema, makeSources(`
[providers.anthropic]
type = "anthropic"
api_key = "sk-ant"
model = "claude-opus-4-6"
thinking = true
thinking_budget_tokens = 10000

[settings.llm]
extend = "providers.anthropic"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.llm.api_key).toBe("sk-ant");
    expect(result.data.settings.llm.model).toBe("claude-opus-4-6");
    expect(result.data.settings.llm.thinking).toBe(true);
    expect(result.data.settings.llm.thinking_budget_tokens).toBe(10000);
  });

  test("extend 后可覆盖字段", () => {
    const result = getConfig(settingsSchema, makeSources(`
[providers.base]
type = "anthropic"
api_key = "sk-base"
model = "base-model"

[settings.llm]
extend = "providers.base"
model = "overridden-model"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.llm.api_key).toBe("sk-base");
    expect(result.data.settings.llm.model).toBe("overridden-model");
  });

  test("链式 extend", () => {
    const result = getConfig(settingsSchema, makeSources(`
[providers.base]
type = "anthropic"
api_key = "sk-base"
model = "base-model"

[providers.child]
extend = "providers.base"
thinking = true

[settings.llm]
extend = "providers.child"
model = "final-model"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.llm.api_key).toBe("sk-base");
    expect(result.data.settings.llm.thinking).toBe(true);
    expect(result.data.settings.llm.model).toBe("final-model");
  });

  test("extend 目标不存在时返回错误", () => {
    const result = getConfig(settingsSchema, makeSources(`
[settings.llm]
extend = "providers.nonexistent"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.errors[0]!.kind).toBe("extend_target_not_found");
  });

  test("循环 extend 检测", () => {
    const result = getConfig(settingsSchema, makeSources(`
[providers.a]
extend = "providers.b"

[providers.b]
extend = "providers.a"

[settings.llm]
extend = "providers.a"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    const kinds = result.errors.map((e) => e.kind);
    expect(kinds).toContain("circular_extend");
  });
});

// ═══════════════════════════════════════════════
// trace
// ═══════════════════════════════════════════════

describe("trace 来源追踪", () => {
  test("trace 记录字段来源", () => {
    const result = getConfig(settingsSchema, [
      { name: "默认", content: DEFAULT_TOML },
      {
        name: "全局",
        content: `
[settings.llm]
type = "anthropic"
api_key = "sk-global"
model = "claude-opus"

[settings.editor]
type = "openai"
api_key = "sk-global-ed"
model = "gpt-4o"
`,
      },
      {
        name: "项目",
        content: `
[settings.llm]
model = "claude-sonnet"
`,
      },
    ], {});

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    const { trace } = result;
    expect(trace["settings.llm.model"]?.source).toBe("项目");
    expect(trace["settings.llm.model"]?.value).toBe("claude-sonnet");
    expect(trace["settings.llm.type"]?.source).toBe("全局");
    expect(trace["settings.strip_hint"]?.source).toBe("默认");
    expect(trace["settings.strip_hint"]?.value).toBe(true);
  });

  test("trace 记录 extend 来源", () => {
    const result = getConfig(settingsSchema, makeSources(`
[providers.anthropic]
type = "anthropic"
api_key = "sk-ant"
model = "claude-opus"

[settings.llm]
extend = "providers.anthropic"
model = "overridden"

[settings.editor]
type = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`));

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    const { trace } = result;
    expect(trace["settings.llm.type"]?.value).toBe("anthropic");
    expect(trace["settings.llm.api_key"]?.value).toBe("sk-ant");
    expect(trace["settings.llm.model"]?.value).toBe("overridden");
  });
});

// ═══════════════════════════════════════════════
// 错误处理
// ═══════════════════════════════════════════════

describe("错误处理", () => {
  test("无效 TOML 语法返回 toml_parse_error", () => {
    const result = getConfig(settingsSchema, [
      { name: "默认", content: "not valid toml {{{" },
    ]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.errors[0]!.kind).toBe("toml_parse_error");
  });

  test("schema 验证失败返回 schema_validation_error", () => {
    const result = getConfig(settingsSchema, [
      {
        name: "全局",
        content: `
[settings.llm]
type = "anthropic"
api_key = "sk-test"
`,
      },
    ]);
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.errors[0]!.kind).toBe("schema_validation_error");
  });
});

// ═══════════════════════════════════════════════
// 集成
// ═══════════════════════════════════════════════

describe("集成场景", () => {
  test("全局定义 provider，项目通过 extend 引用", () => {
    const result = getConfig(settingsSchema, [
      { name: "默认", content: DEFAULT_TOML },
      {
        name: "全局",
        content: `
[providers.anthropic]
type = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus-4-6"
thinking = true
thinking_budget_tokens = 10000
edit_backend = "str-replace"

[providers.flash]
extend = "providers.anthropic"
model = "claude-sonnet"
thinking = false

[settings.llm]
extend = "providers.anthropic"

[settings.editor]
extend = "providers.flash"
`,
      },
      {
        name: "项目",
        content: `
[settings]
strip_hint = false
`,
      },
    ], { ANTHROPIC_KEY: "sk-ant-xxx" });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");

    expect(result.data.settings.llm.type).toBe("anthropic");
    expect(result.data.settings.llm.api_key).toBe("sk-ant-xxx");
    expect(result.data.settings.llm.model).toBe("claude-opus-4-6");
    expect(result.data.settings.llm.thinking).toBe(true);

    expect(result.data.settings.editor.type).toBe("anthropic");
    expect(result.data.settings.editor.model).toBe("claude-sonnet");
    expect(result.data.settings.editor.thinking).toBe(false);

    expect(result.data.settings.strip_hint).toBe(false);
    expect(result.trace["settings.strip_hint"]?.source).toBe("项目");
    expect(result.trace["settings.llm.model"]?.source).toBe("全局");
  });
});
