/**
 * Code Agent show 工具配置
 *
 * 定义 code agent 的四种 show type：
 * - progress report: 阶段性进展
 * - ask user question: 向用户提问
 * - request user assistance: 请求用户协助
 * - final report: 任务完成
 */

import type { ShowTypeConfig } from "@n0n/tools";

export const showConfig: ShowTypeConfig[] = [
	{
		value: "progress report",
		typeDesc:
			"汇报阶段性进展后继续工作。假定用户已失去上下文，务必完整自包含。",
		contentDesc: [
			"记录你做了什么判断、基于什么证据、排除了什么替代方案。",
			"判断标准：如果你排除了至少一种合理的替代方案，就值得记录。如果只有一种合理做法（无需选择），不必汇报。",
			"即使只是一两句话也值得记录——重点是暴露决策点，不是写长文。",
		].join("\n"),
	},
	{
		value: "ask user question",
		typeDesc: "向用户提问，等待用户选择后继续。",
		contentDesc: [
			"先展示推导上下文（你的判断链条和依据），再提出具体问题并提供 2-4 个选项。",
			"必须自包含——假定用户没有阅读之前的 progress report，仅凭这一条就能理解你为什么问这个问题。",
			"格式：先写推导上下文和问题描述，然后用选项 DSL——每个选项以 `## ` 开头作为标题行，下一行写详细说明。示例：",
			"",
			"我判断 token 刷新失败是因为竞态条件（依据：日志显示刷新窗口和过期时间重叠）。修复方案有两种，各有取舍，需要你决定：",
			"## 方案 A：mutex 保护刷新流程",
			"根治竞态，但引入锁可能影响并发性能",
			"## 方案 B：缩短 token 有效期",
			"规避时间窗口重叠，但增加了刷新频率和网络开销",
		].join("\n"),
	},
	{
		value: "request user assistance",
		typeDesc: "需要用户介入操作或提供无法通过文字传达的信息。",
		contentDesc: [
			"说明当前遇到的障碍、为什么无法自主解决、需要用户做什么。",
			"必须自包含——假定用户已失去上下文。",
			"明确告知用户需要执行的操作（如配置 API key、手动验证 UI、提供文件等）。",
		].join("\n"),
	},
	{
		value: "final report",
		typeDesc: "任务完成，提交最终汇报。假定用户已失去上下文，务必完整自包含。",
		contentDesc:
			"完成汇报——详细说明已完成的工作、验证结果和关键决策。可选在末尾用 `---` 分隔后附后续步骤建议。",
	},
];
