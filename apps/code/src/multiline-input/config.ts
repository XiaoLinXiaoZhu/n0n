/**
 * 多行输入编辑器配置 schema
 *
 * 对应 TOML 的 [settings.user_input] 段。遵循 parse-don't-verify：
 * 在配置入口处直接 parse 成内部需要的类型——`-1`（无限制）被转成 `null`，
 * 对齐字段被收敛为严格枚举，下游拿到的就是干净的内部类型，无需再校验。
 */

import { z } from "zod";
import { DEFAULT_CODE_SETTINGS } from "../config-defaults.ts";

/** 菜单/输入框对齐位置 */
export type EditorAlign = "left" | "center" | "right";

/**
 * 内部使用的编辑器配置（已 parse）。
 * maxWidth/maxHeight 为 null 表示无限制（受终端尺寸约束）。
 */
export interface UserInputConfig {
	maxWidth: number | null;
	maxHeight: number | null;
	align: EditorAlign;
}

/** 把 TOML 的 -1（或 ≤0）转为 null（无限制），正数原样保留 */
const limitField = z
	.number()
	.default(DEFAULT_CODE_SETTINGS.user_input.max_width)
	.transform((n) => (n > 0 ? n : null));

const fields = z.object({
	max_width: limitField,
	max_height: z
		.number()
		.default(DEFAULT_CODE_SETTINGS.user_input.max_height)
		.transform((n) => (n > 0 ? n : null)),
	align: z
		.enum(["left", "center", "right"])
		.default(DEFAULT_CODE_SETTINGS.user_input.align),
});

/**
 * [settings.user_input] schema。整段可缺省（undefined 时用全默认），
 * parse 后直接得到干净的 UserInputConfig。
 */
export const UserInputConfigSchema = z
	.optional(fields)
	.transform((c): UserInputConfig => {
		const parsed = c ?? fields.parse({});
		return {
			maxWidth: parsed.max_width,
			maxHeight: parsed.max_height,
			align: parsed.align,
		};
	});
