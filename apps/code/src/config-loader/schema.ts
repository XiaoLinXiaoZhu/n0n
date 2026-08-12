/**
 * Code App 配置 Schema 与类型定义
 *
 * 独立于加载逻辑，供 loader 和 display 共用。
 */

import { ProviderConfigSchema } from "@n0n/llm";
import { z } from "zod";
import { DEFAULT_CODE_SETTINGS } from "../config-defaults.ts";
import { UserInputConfigSchema } from "../multiline-input/config.ts";

export const codeConfigSchema = z.object({
	settings: z.object({
		strip_hint: z.boolean().default(DEFAULT_CODE_SETTINGS.strip_hint),
		memory_tag: z.boolean().default(DEFAULT_CODE_SETTINGS.memory_tag),
		notify_sound: z.boolean().default(DEFAULT_CODE_SETTINGS.notify_sound),
		notify_sound_path: z
			.string()
			.default(DEFAULT_CODE_SETTINGS.notify_sound_path),
		agent: z.object({
			max_iterations: z
				.number()
				.default(DEFAULT_CODE_SETTINGS.agent.max_iterations),
			max_idle_rounds: z
				.number()
				.default(DEFAULT_CODE_SETTINGS.agent.max_idle_rounds),
			default_exec_waitfor: z
				.number()
				.default(DEFAULT_CODE_SETTINGS.agent.default_exec_waitfor),
			max_exec_output_tokens: z
				.number()
				.int()
				.positive()
				.default(DEFAULT_CODE_SETTINGS.agent.max_exec_output_tokens),
		}),
		security: z.object({
			blocked_commands: z
				.array(z.string())
				.default(DEFAULT_CODE_SETTINGS.security.blocked_commands),
		}),
		cli: z.object({
			open_command: z
				.array(z.string())
				.min(1)
				.default(DEFAULT_CODE_SETTINGS.cli.open_command),
		}),
		llm: ProviderConfigSchema,
		user_input: UserInputConfigSchema,
	}),
});

export type CodeSettings = z.infer<typeof codeConfigSchema>["settings"];
