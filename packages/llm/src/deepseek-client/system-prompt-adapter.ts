/**
 * DeepSeek 系统提示词适配器
 *
 * 从完整请求中提取系统消息，经 deepseek tag 风格适配后合并，
 * 并将工具定义以 DeepSeek 原生 DSML 格式前置注入。
 *
 * 走正常的 formatPrompt → TagAdapter 路线，不绕过 tag 适配体系。
 *
 * 工具前置动机：
 * DeepSeek 的默认处理是将工具定义追加到系统提示词末尾。
 * 但其他模型通常将工具放在最前面——前置的工具定义能让模型更早注意到
 * 工具约束，后续系统提示词中引用"调用 xx 工具"也更自然。
 * 最终结构：[前置工具定义] + [系统提示词] + [API 自动追加的工具定义]
 */

import { createTagAdapter, formatPrompt } from "@n0n/shared";
import type { StreamRequest, ToolDefinition } from "@n0n/types";

const deepseekTags = createTagAdapter("deepseek");

// ── DeepSeek DSML 常量（与官方 encoding_dsv4.py 一致） ──

const DSML_TOKEN = "｜DSML｜";
const THINKING_START = "<think>";
const THINKING_END = "</think>";

/**
 * 工具定义模板——与 DeepSeek 官方 encoding_dsv4.py 中 TOOLS_TEMPLATE 完全一致。
 * 占位符 {tool_schemas} 由渲染后的工具 JSON 填充。
 */
const TOOLS_TEMPLATE = `## Tools

You have access to a set of tools to help answer the user's question. You can invoke tools by writing a "<${DSML_TOKEN}tool_calls>" block like the following:

<${DSML_TOKEN}tool_calls>
<${DSML_TOKEN}invoke name="$TOOL_NAME">
<${DSML_TOKEN}parameter name="$PARAMETER_NAME" string="true|false">$PARAMETER_VALUE</${DSML_TOKEN}parameter>
...
</${DSML_TOKEN}invoke>
<${DSML_TOKEN}invoke name="$TOOL_NAME2">
...
</${DSML_TOKEN}invoke>
</${DSML_TOKEN}tool_calls>

String parameters should be specified as is and set \`string="true"\`. For all other types (numbers, booleans, arrays, objects), pass the value in JSON format and set \`string="false"\`.

If thinking_mode is enabled (triggered by ${THINKING_START}), you MUST output your complete reasoning inside ${THINKING_START}...${THINKING_END} BEFORE any tool calls or final response.

Otherwise, output directly after ${THINKING_END} with tool calls or final response.

### Available Tool Schemas

{tool_schemas}

You MUST strictly follow the above defined tool name and parameter schemas to invoke tool calls.`;

// ── 工具渲染 ──

/**
 * 将 ToolDefinition[] 渲染为 DeepSeek 原生格式的工具定义文本。
 *
 * 与 encoding_dsv4.py 中 render_tools 一致：每个工具序列化为 JSON，
 * 填入 TOOLS_TEMPLATE。
 */
function renderTools(tools: ToolDefinition[]): string {
	const schemas = tools.map((t) => {
		const schema = {
			name: t.name,
			description: t.description,
			parameters: t.parameters,
		};
		return JSON.stringify(schema, null, 2);
	});

	return TOOLS_TEMPLATE.replace("{tool_schemas}", schemas.join("\n"));
}

// ── 主函数 ──

/**
 * 将完整请求中的系统提示词提取并适配为 DeepSeek 风格，
 * 同时将工具定义以 DSML 格式前置注入。
 *
 * 内部流程：
 * 1. 使用 deepseek TagAdapter 执行 formatPrompt，将 DomainMessage[] 转为 PromptMessage[]
 * 2. 提取所有 role=system 的消息内容，合并为系统提示词
 * 3. 若有工具定义，用 DeepSeek 原生 DSML 格式渲染后前置
 * 4. 返回最终的系统提示词字符串
 *
 * @param request 完整的流式请求（含 messages 和可选的 tools）
 */
export function systemPromptAdapter(request: StreamRequest): string {
	const promptMessages = formatPrompt(request.messages, deepseekTags);

	const systemParts: string[] = [];
	for (const msg of promptMessages) {
		if (msg.role === "system") {
			systemParts.push(msg.content);
		}
	}

	const systemPrompt = systemParts.join("\n\n");

	// 无工具时直接返回系统提示词
	if (!request.tools?.length) {
		return systemPrompt;
	}

	// 有工具时：前置工具定义 + 系统提示词
	const toolsSection = renderTools(request.tools);

	if (!systemPrompt) {
		return toolsSection;
	}

	return `${toolsSection}\n\n${systemPrompt}`;
}
