/**
 * config 模块测试
 *
 * 覆盖：合并、$VAR、extend、trace、错误处理
 *
 * 直接使用 ProviderConfigSchema（discriminated union on `provider`，snake_case，
 * parse 时回退默认值），不再经过中间转换层。
 */

import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { getConfig } from "../index.ts";
import type { ConfigSource } from "../types.ts";

// ── zod schema — 与 packages/llm/src/config.ts 的 ProviderConfigSchema 对齐 ──

const providerSchema = z.discriminatedUnion("provider", [
	z.object({
		provider: z.literal("openai"),
		api_key: z.string(),
		model: z.string(),
		base_url: z.string().default("https://api.openai.com"),
		tag_style: z
			.enum(["deepseek", "glm", "minimax", "default"])
			.default("default"),
	}),
	z.object({
		provider: z.literal("anthropic"),
		api_key: z.string(),
		model: z.string(),
		base_url: z.string().default("https://api.anthropic.com"),
		tag_style: z
			.enum(["deepseek", "glm", "minimax", "default"])
			.default("default"),
		thinking: z
			.object({
				type: z.literal("enabled"),
				budget_tokens: z.number(),
			})
			.optional(),
	}),
	z.object({
		provider: z.literal("google"),
		api_key: z.string(),
		model: z.string(),
		base_url: z.string().default("https://generativelanguage.googleapis.com"),
		tag_style: z
			.enum(["deepseek", "glm", "minimax", "default"])
			.default("default"),
		reasoning_effort: z.enum(["low", "medium", "high"]).default("high"),
	}),
	z.object({
		provider: z.literal("openai-compatible"),
		api_key: z.string(),
		model: z.string(),
		base_url: z.string(),
		tag_style: z
			.enum(["deepseek", "glm", "minimax", "default"])
			.default("default"),
		backend_provider: z
			.enum(["anthropic", "google", "openai"])
			.default("openai"),
		enable_thinking: z.boolean().default(false),
	}),
	z.object({
		provider: z.literal("deepseek"),
		api_key: z.string(),
		model: z.string(),
		base_url: z.string().default("https://api.deepseek.com"),
		tag_style: z
			.enum(["deepseek", "glm", "minimax", "default"])
			.default("deepseek"),
		enable_thinking: z.boolean().default(false),
		reasoning_effort: z.enum(["high", "max"]).optional(),
	}),
]);

const settingsSchema = z.object({
	settings: z.object({
		strip_hint: z.boolean(),
		notify_sound: z.boolean(),
		notify_sound_path: z.string(),
		blocked_commands: z.array(z.string()),
		llm: providerSchema,
		editor: providerSchema,
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

function makeSources(...tomls: string[]): ConfigSource[] {
	return [
		{ name: "默认", content: DEFAULT_TOML },
		...tomls.map((content, i) => ({
			name: i === 0 ? "全局" : "项目",
			content,
		})),
	];
}

// ═══════════════════════════════════════════════════════════
// 基本解析
// ═══════════════════════════════════════════════════════════

describe("基本解析", () => {
	test("解析单个 TOML 源", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings]
strip_hint = false

[settings.llm]
provider = "anthropic"
api_key = "sk-test"
model = "claude-opus-4-6"

[settings.editor]
provider = "openai"
api_key = "sk-test-2"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		expect(result.data.settings.strip_hint).toBe(false);
		const llm = result.data.settings.llm;
		expect(llm.provider).toBe("anthropic");
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-test");
		expect(llm.model).toBe("claude-opus-4-6");
		expect(llm.base_url).toBe("https://api.anthropic.com");

		const editor = result.data.settings.editor;
		expect(editor.provider).toBe("openai");
	});

	test("默认 source 填充顶层字段", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
provider = "anthropic"
api_key = "sk-test"
model = "claude-opus-4-6"

[settings.editor]
provider = "openai"
api_key = "sk-test-2"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		// 默认值来自 "默认" source
		expect(result.data.settings.strip_hint).toBe(true);
		expect(result.data.settings.notify_sound).toBe(false);
	});

	test("schema 默认值填充 provider 字段", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
provider = "deepseek"
api_key = "sk-test"
model = "deepseek-r1"

[settings.editor]
provider = "openai"
api_key = "sk-test-2"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "deepseek") throw new Error("expected deepseek");
		// schema 默认值
		expect(llm.base_url).toBe("https://api.deepseek.com");
		expect(llm.tag_style).toBe("deepseek");
		expect(llm.enable_thinking).toBe(false);
		// reasoning_effort 是 optional — 不设则不出现在类型上
		expect(llm.reasoning_effort).toBeUndefined();
	});
});

// ═══════════════════════════════════════════════════════════
// 多文件合并
// ═══════════════════════════════════════════════════════════

describe("多文件合并", () => {
	test("后者覆盖前者", () => {
		const result = getConfig(
			settingsSchema,
			[
				{ name: "默认", content: DEFAULT_TOML },
				{
					name: "全局",
					content: `
[settings.llm]
provider = "anthropic"
api_key = "sk-global"
model = "claude-opus"

[settings.editor]
provider = "openai"
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
			],
			{},
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-project");
		expect(llm.model).toBe("claude-sonnet");
		expect(result.data.settings.editor.provider).toBe("openai");
	});
});

// ═══════════════════════════════════════════════════════════
// $VAR 解析
// ═══════════════════════════════════════════════════════════

describe("$VAR 解析", () => {
	test("$VAR 从 envPool 解析", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus"

[settings.editor]
provider = "openai"
api_key = "sk-test"
model = "gpt-4o"
`),
			{ ANTHROPIC_KEY: "sk-from-env" },
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-from-env");
	});

	test("$VAR 未找到时返回错误", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
provider = "anthropic"
api_key = "$MISSING_KEY"
model = "claude-opus"

[settings.editor]
provider = "openai"
api_key = "sk-test"
model = "gpt-4o"
`),
			{},
		);

		expect(result.success).toBe(false);
		if (result.success) throw new Error("expected failure");
		expect(result.errors[0]?.kind).toBe("env_var_not_found");
	});

	test("$ 后非大写字母不触发解析", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
provider = "anthropic"
api_key = "$not_a_var"
model = "claude-opus"

[settings.editor]
provider = "openai"
api_key = "sk-test"
model = "gpt-4o"
`),
			{},
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");
		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("$not_a_var");
	});
});

// ═══════════════════════════════════════════════════════════
// extend 解析
// ═══════════════════════════════════════════════════════════

describe("extend 解析", () => {
	test("settings.llm 通过 extend 引用 provider", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.anthropic]
provider = "anthropic"
api_key = "sk-ant"
model = "claude-opus-4-6"

[providers.anthropic.thinking]
type = "enabled"
budget_tokens = 10000

[settings.llm]
extend = "providers.anthropic"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-ant");
		expect(llm.model).toBe("claude-opus-4-6");
		expect(llm.thinking).toEqual({
			type: "enabled",
			budget_tokens: 10000,
		});
	});

	test("extend 后可覆盖字段", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.base]
provider = "anthropic"
api_key = "sk-base"
model = "base-model"

[settings.llm]
extend = "providers.base"
model = "overridden-model"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-base");
		expect(llm.model).toBe("overridden-model");
	});

	test("链式 extend", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.base]
provider = "anthropic"
api_key = "sk-base"
model = "base-model"

[providers.child]
extend = "providers.base"

[providers.child.thinking]
type = "enabled"
budget_tokens = 8000

[settings.llm]
extend = "providers.child"
model = "final-model"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-base");
		expect(llm.thinking).toEqual({
			type: "enabled",
			budget_tokens: 8000,
		});
		expect(llm.model).toBe("final-model");
	});

	test("extend 目标不存在时返回错误", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[settings.llm]
extend = "providers.nonexistent"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(false);
		if (result.success) throw new Error("expected failure");
		expect(result.errors[0]?.kind).toBe("extend_target_not_found");
	});

	test("extend 深层合并 nested object", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.anthropic]
provider = "anthropic"
api_key = "sk-ant"
model = "claude-opus-4-6"

[providers.anthropic.thinking]
type = "enabled"
budget_tokens = 10000

[settings.llm]
extend = "providers.anthropic"

[settings.llm.thinking]
budget_tokens = 5000

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		// 深层合并：own 覆盖 budget_tokens，但 type 从 target 继承
		expect(llm.thinking).toEqual({
			type: "enabled",
			budget_tokens: 5000,
		});
	});

	test("循环 extend 检测", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.a]
extend = "providers.b"

[providers.b]
extend = "providers.a"

[settings.llm]
extend = "providers.a"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(false);
		if (result.success) throw new Error("expected failure");
		const kinds = result.errors.map((e) => e.kind);
		expect(kinds).toContain("circular_extend");
	});
});

// ═══════════════════════════════════════════════════════════
// trace
// ═══════════════════════════════════════════════════════════

describe("trace 来源追踪", () => {
	test("trace 记录字段来源", () => {
		const result = getConfig(
			settingsSchema,
			[
				{ name: "默认", content: DEFAULT_TOML },
				{
					name: "全局",
					content: `
[settings.llm]
provider = "anthropic"
api_key = "sk-global"
model = "claude-opus"

[settings.editor]
provider = "openai"
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
			],
			{},
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const { trace } = result;
		expect(trace["settings.llm.model"]?.source).toBe("项目");
		expect(trace["settings.llm.model"]?.value).toBe("claude-sonnet");
		expect(trace["settings.llm.provider"]?.source).toBe("全局");
		expect(trace["settings.strip_hint"]?.source).toBe("默认");
		expect(trace["settings.strip_hint"]?.value).toBe(true);
	});

	test("trace 记录 extend 来源", () => {
		const result = getConfig(
			settingsSchema,
			makeSources(`
[providers.anthropic]
provider = "anthropic"
api_key = "sk-ant"
model = "claude-opus"

[settings.llm]
extend = "providers.anthropic"
model = "overridden"

[settings.editor]
provider = "openai"
api_key = "sk-oai"
model = "gpt-4o"
`),
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const { trace } = result;
		expect(trace["settings.llm.provider"]?.value).toBe("anthropic");
		expect(trace["settings.llm.api_key"]?.value).toBe("sk-ant");
		expect(trace["settings.llm.model"]?.value).toBe("overridden");
	});
});

// ═══════════════════════════════════════════════════════════
// 错误处理
// ═══════════════════════════════════════════════════════════

describe("错误处理", () => {
	test("无效 TOML 语法返回 toml_parse_error", () => {
		const result = getConfig(settingsSchema, [
			{ name: "默认", content: "not valid toml {{{" },
		]);
		expect(result.success).toBe(false);
		if (result.success) throw new Error("expected failure");
		expect(result.errors[0]?.kind).toBe("toml_parse_error");
	});

	test("schema 验证失败返回 schema_validation_error", () => {
		const result = getConfig(settingsSchema, [
			{
				name: "全局",
				content: `
[settings.llm]
provider = "anthropic"
api_key = "sk-test"
`,
			},
		]);
		expect(result.success).toBe(false);
		if (result.success) throw new Error("expected failure");
		expect(result.errors[0]?.kind).toBe("schema_validation_error");
	});
});

// ═══════════════════════════════════════════════════════════
// 集成
// ═══════════════════════════════════════════════════════════

describe("集成场景", () => {
	test("全局定义 provider，项目通过 extend 引用", () => {
		const result = getConfig(
			settingsSchema,
			[
				{ name: "默认", content: DEFAULT_TOML },
				{
					name: "全局",
					content: `
[providers.anthropic]
provider = "anthropic"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus-4-6"

[providers.anthropic.thinking]
type = "enabled"
budget_tokens = 10000

[providers.flash]
extend = "providers.anthropic"
model = "claude-sonnet"

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
			],
			{ ANTHROPIC_KEY: "sk-ant-xxx" },
		);

		expect(result.success).toBe(true);
		if (!result.success) throw new Error("expected success");

		const llm = result.data.settings.llm;
		if (llm.provider !== "anthropic") throw new Error("expected anthropic");
		expect(llm.api_key).toBe("sk-ant-xxx");
		expect(llm.model).toBe("claude-opus-4-6");
		expect(llm.thinking).toEqual({
			type: "enabled",
			budget_tokens: 10000,
		});

		const editor = result.data.settings.editor;
		if (editor.provider !== "anthropic") throw new Error("expected anthropic");
		expect(editor.model).toBe("claude-sonnet");
		// flash 继承自 anthropic 但没有自己的 thinking，deep merge 后 thinking 仍在
		// extend 语义是 { ...target, ...own }，own 没有覆盖 thinking 所以继承 target 的

		expect(result.data.settings.strip_hint).toBe(false);
		expect(result.trace["settings.strip_hint"]?.source).toBe("项目");
		expect(result.trace["settings.llm.model"]?.source).toBe("全局");
	});
});
