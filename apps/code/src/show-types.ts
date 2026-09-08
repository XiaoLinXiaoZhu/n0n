/**
 * Code Agent 可见消息接口的唯一结构化来源。
 *
 * lifecycle 只描述运行时行为：
 * - continue：渲染并持久化后自动继续；
 * - wait：等待客户的新输入；
 * - terminal：结束当前生产周期。
 *
 * 类型的质量语义和正文要求仍由 Self-Function 标准定义。
 */
export const CODE_SHOW_DEFINITIONS = [
	{
		value: "production record",
		lifecycle: "continue",
		typeDesc:
			"记录有价值的结论、证据或生产决定；不需要客户新输入。系统显示并持久化，不提醒、不等待，并自动继续当前生产周期。",
	},
	{
		value: "customer information required",
		lifecycle: "wait",
		typeDesc:
			"需要客户提供其已经掌握、生产方无法自行取得的事实、要求、路径或背景。系统显示并持久化，提醒客户并等待答复。",
	},
	{
		value: "customer decision required",
		lifecycle: "wait",
		typeDesc:
			"需要客户选择、授权、接受风险或修订有效契约。系统显示并持久化，提醒客户并等待答复。",
	},
	{
		value: "customer action required",
		lifecycle: "wait",
		typeDesc:
			"需要客户在会话外完成生产方无法代做的操作。系统显示并持久化，提醒客户并等待答复。",
	},
	{
		value: "qualified delivery",
		lifecycle: "terminal",
		typeDesc:
			"当前有效验收基线全部满足。系统显示并持久化合格交付，提醒客户并结束当前生产周期。",
	},
	{
		value: "production suspended",
		lifecycle: "terminal",
		typeDesc:
			"当前基线未满足，但存在明确恢复条件；本周期不再等待客户。系统显示并持久化生产暂停，提醒客户并结束当前生产周期。",
	},
	{
		value: "production failed",
		lifecycle: "terminal",
		typeDesc:
			"当前基线未满足，且当前订单边界内不存在有效完成路径。系统显示并持久化生产失败，提醒客户并结束当前生产周期。",
	},
	{
		value: "customer cancelled",
		lifecycle: "terminal",
		typeDesc:
			"客户撤回订单且不要求验收现有产物。系统显示并持久化客户取消，提醒客户并结束当前生产周期。",
	},
] as const;

type CodeShowDefinition = (typeof CODE_SHOW_DEFINITIONS)[number];

export type CodeShowType = CodeShowDefinition["value"];
export type CodeTerminalShowType = Extract<
	CodeShowDefinition,
	{ lifecycle: "terminal" }
>["value"];

export const CODE_SHOW_TYPES = CODE_SHOW_DEFINITIONS.map(
	(definition) => definition.value,
) as [CodeShowType, ...CodeShowType[]];

export const CODE_TERMINAL_SHOW_TYPES = CODE_SHOW_DEFINITIONS.filter(
	(definition) => definition.lifecycle === "terminal",
).map((definition) => definition.value) as CodeTerminalShowType[];

const terminalTypes = new Set<CodeShowType>(CODE_TERMINAL_SHOW_TYPES);

export function isCodeTerminalShowType(
	type: CodeShowType,
): type is CodeTerminalShowType {
	return terminalTypes.has(type);
}

export type CodeWaitShowType = Extract<
	CodeShowDefinition,
	{ lifecycle: "wait" }
>["value"];

export const CODE_WAIT_SHOW_TYPES = CODE_SHOW_DEFINITIONS.filter(
	(definition) => definition.lifecycle === "wait",
).map((definition) => definition.value) as CodeWaitShowType[];

const waitTypes = new Set<CodeShowType>(CODE_WAIT_SHOW_TYPES);

export function isCodeWaitShowType(
	type: CodeShowType,
): type is CodeWaitShowType {
	return waitTypes.has(type);
}
