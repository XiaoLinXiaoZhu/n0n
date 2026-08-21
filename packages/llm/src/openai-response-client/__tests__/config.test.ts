import { describe, expect, test } from "bun:test";
import { LLM_PROVIDERS } from "@n0n/types";
import { ProviderConfigSchema } from "../../config.ts";

describe("openai-response config", () => {
	test("注册 provider 并应用默认 base_url", () => {
		expect(LLM_PROVIDERS).toContain("openai-response");
		expect(
			ProviderConfigSchema.parse({
				provider: "openai-response",
				api_key: "key",
				model: "gpt-test",
			}),
		).toEqual({
			provider: "openai-response",
			api_key: "key",
			model: "gpt-test",
			base_url: "https://api.openai.com",
			tag_style: "default",
		});
	});
});
