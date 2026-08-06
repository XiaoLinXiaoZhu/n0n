/**
 * Code App 配置 Schema 与类型定义
 *
 * 独立于加载逻辑，供 loader 和 display 共用。
 */

import { ProviderConfigSchema } from "@n0n/llm";
import { z } from "zod";
import { UserInputConfigSchema } from "../multiline-input/config.ts";

export const codeConfigSchema = z.object({
	settings: z.object({
		strip_hint: z.boolean().default(true),
		memory_tag: z.boolean().default(false),
		notify_sound: z.boolean().default(false),
		notify_sound_path: z.string().default(""),
		agent: z.object({
			max_iterations: z.number().default(50),
			max_idle_rounds: z.number().default(5),
			default_exec_waitfor: z.number().default(120),
		}),
		security: z.object({
			blocked_commands: z.array(z.string()).default([]),
		}),
		llm: ProviderConfigSchema,
		user_input: UserInputConfigSchema,
	}),
});

export type CodeSettings = z.infer<typeof codeConfigSchema>["settings"];
