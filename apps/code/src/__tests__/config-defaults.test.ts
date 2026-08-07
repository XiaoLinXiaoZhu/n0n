import { describe, expect, test } from "bun:test";
import {
	DEFAULT_CODE_SETTINGS,
	DEFAULT_OPEN_COMMAND,
} from "../config-defaults.ts";
import { codeConfigSchema } from "../config-loader/schema.ts";

describe("code config defaults", () => {
	test("schema 默认值来自统一默认配置", () => {
		const result = codeConfigSchema.parse({
			settings: {
				agent: {},
				security: {},
				cli: {},
				llm: {
					provider: "openai",
					api_key: "test-key",
					model: "test-model",
				},
			},
		});

		expect(result.settings.strip_hint).toBe(DEFAULT_CODE_SETTINGS.strip_hint);
		expect(result.settings.memory_tag).toBe(DEFAULT_CODE_SETTINGS.memory_tag);
		expect(result.settings.notify_sound).toBe(
			DEFAULT_CODE_SETTINGS.notify_sound,
		);
		expect(result.settings.agent).toEqual(DEFAULT_CODE_SETTINGS.agent);
		expect(result.settings.security).toEqual(DEFAULT_CODE_SETTINGS.security);
		expect(result.settings.cli.open_command).toEqual(DEFAULT_OPEN_COMMAND);
		expect(result.settings.user_input).toEqual({
			maxWidth: null,
			maxHeight: null,
			align: DEFAULT_CODE_SETTINGS.user_input.align,
		});
	});
});
