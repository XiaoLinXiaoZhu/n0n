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
			"当前判断、支持该判断的证据、下一步动作。用于公示决策时另需给出：所做的决定、理由、被否决的替代方案及否决理由。",
	},
	{
		value: "ask user question",
		typeDesc: "向用户提问。系统暂停循环，等待用户答复。",
		contentDesc:
			"先给推导过程与证据，再给 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明），写明选项之间的后果差异；有倾向时说明倾向哪一项及把握程度。必须自包含。",
	},
	{
		value: "request user assistance",
		typeDesc: "请求用户介入操作。系统暂停循环，等待用户响应。",
		contentDesc:
			"障碍的具体现象、你无法自主解决的原因、需要用户执行的具体操作。必须自包含。",
	},
	{
		value: "final report",
		typeDesc: "本轮生产结束的正式交付。系统暂停循环，等待用户响应。",
		contentDesc:
			"已完成的工作、验证结果及其证据、本轮做出的关键决策。假定用户不掌握此前上下文，必须自包含。",
	},
];
