/**
 * Code Agent show 工具配置
 *
 * 定义 code agent 的八种 show type：一种继续、三种等待、四种终态。
 *
 * 此处只描述接口可观察行为。何时使用、内容质量和终态判据由
 * Self-Function 标准唯一规定。
 */

import type { ShowTypeConfig } from "@n0n/tools";
import { CODE_SHOW_DEFINITIONS } from "./show-types.ts";

function toShowConfig(
	definitions: readonly (typeof CODE_SHOW_DEFINITIONS)[number][],
): ShowTypeConfig[] {
	return definitions.map(({ value, typeDesc }) => ({
		value,
		typeDesc,
		contentDesc: "",
	}));
}

export const showConfig = toShowConfig(CODE_SHOW_DEFINITIONS);

/**
 * 客户后续参与不可用时的运行时接口。
 *
 * 这不是另一套质量标准，只是从当前订单条件移除三种无法履行的等待动作。
 */
export const noCustomerParticipationShowConfig = toShowConfig(
	CODE_SHOW_DEFINITIONS.filter((definition) => definition.lifecycle !== "wait"),
);
