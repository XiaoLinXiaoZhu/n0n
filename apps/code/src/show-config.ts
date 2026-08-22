/**
 * Code Agent show 工具配置
 *
 * 定义 code agent 的四种 show type：typeDesc 说明该 type 的系统行为与适用情形，
 * contentDesc 说明该 type 下 content 应包含什么。
 *
 * 两者都只描述接口契约。何时该发消息、发到什么程度由 self-function 标准的
 * 对话与交付一章承载，此处不重复。
 */

import type { ShowTypeConfig } from "@n0n/tools";

export const showConfig: ShowTypeConfig[] = [
	{
		value: "working log",
		typeDesc:
			"内部工作日志，也用于公示决策。系统自动继续循环，用户不会被即时通知。需要用户现在看到并响应时，改用其他三种 type。",
		contentDesc:
			"只写一个具体进展：新形成的结论、紧邻的证据、下一步动作；首次执行前写先处理什么、理由和预期证据。不要转录例行工具调用或逐步推理。用于公示决策时另需给出决定、理由、被否决的替代方案及理由。",
	},
	{
		value: "ask user question",
		typeDesc: "向用户提问。系统暂停循环，等待用户答复。",
		contentDesc:
			"先给推导过程与证据，再给 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明），写明选项之间的后果差异；有倾向时说明倾向及把握程度；结尾说明用户只需怎样回复。必须自包含。",
	},
	{
		value: "request user assistance",
		typeDesc: "请求用户介入操作。系统暂停循环，等待用户响应。",
		contentDesc:
			"障碍的具体现象、你无法自主解决的原因、需要用户执行的具体操作、操作后应返回的最小信息。必须自包含。",
	},
	{
		value: "final report",
		typeDesc: "本轮生产结束的正式交付。系统暂停循环，等待用户响应。",
		contentDesc:
			"开头给交付结论、范围与实际完成状态；随后写已完成工作、紧邻的验证证据、关键决策；有未完成或未验证内容时写明边界。假定用户不掌握此前上下文，必须自包含。",
	},
];
