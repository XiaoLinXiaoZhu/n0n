/**
 * Code Agent show 工具配置
 *
 * 定义 code agent 的四种 show type。
 * 行为指南（何时使用、内容质量标准）由 progress-usage skill 承载，
 * 此处仅提供简洁的 API 契约供模型理解工具接口。
 */

import type { ShowTypeConfig } from "@n0n/tools";

export const showConfig: ShowTypeConfig[] = [
	{
		value: "progress report",
		typeDesc:
			"汇报阶段性进展后继续工作。记录判断、证据、排除的替代方案。假定用户已失去上下文，完整自包含。",
		contentDesc: "",
	},
	{
		value: "ask user question",
		typeDesc: "向用户提问，等待选择。",
		contentDesc:
			"先展示推导上下文，再提供 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明）。必须自包含。",
	},
	{
		value: "request user assistance",
		typeDesc: "需要用户介入。",
		contentDesc:
			"说明障碍、无法自主解决的原因、需要用户执行的操作。必须自包含。",
	},
	{
		value: "final report",
		typeDesc:
			"任务完成。详细说明已完成工作、验证结果、关键决策。假定用户已失去上下文，完整自包含。",
		contentDesc: "",
	},
];
