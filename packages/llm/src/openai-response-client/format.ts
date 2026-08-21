import type { PromptMessage, ToolDefinition } from "@n0n/types";
import { decodeResponseSignature } from "./signature.ts";
import type {
	ResponseFunctionCallItem,
	ResponseInputItem,
	ResponseOutputItem,
	ResponseTool,
} from "./types.ts";

function patchFunctionCalls(
	outputItems: ResponseOutputItem[],
	msg: Extract<PromptMessage, { role: "assistant" }>,
): ResponseOutputItem[] {
	if (!msg.toolCalls?.length) return outputItems;

	const toolCalls = new Map(msg.toolCalls.map((call) => [call.id, call]));
	return outputItems.map((item) => {
		if (item.type !== "function_call") return item;
		const callId = item.call_id;
		if (typeof callId !== "string") return item;
		const call = toolCalls.get(callId);
		if (!call) return item;
		return {
			...item,
			type: "function_call" as const,
			call_id: call.id,
			name: call.tool,
			arguments: JSON.stringify(call.args),
		} satisfies ResponseFunctionCallItem;
	});
}

/**
 * PromptMessage → Responses input。
 *
 * 带本 provider signature 的 assistant 消息直接展开原始 output items；
 * 其余消息使用通用字段重建，因此旧历史仍可正常使用。
 */
export function toResponseInput(
	promptMessages: PromptMessage[],
): ResponseInputItem[] {
	const result: ResponseInputItem[] = [];

	for (const msg of promptMessages) {
		switch (msg.role) {
			case "system":
			case "user":
				result.push({ role: msg.role, content: msg.content });
				break;

			case "assistant": {
				const outputItems = decodeResponseSignature(msg.reasoningSignature);
				if (outputItems?.length) {
					result.push(...patchFunctionCalls(outputItems, msg));
					break;
				}

				if (msg.content) {
					result.push({ role: "assistant", content: msg.content });
				}
				for (const call of msg.toolCalls ?? []) {
					result.push({
						type: "function_call",
						call_id: call.id,
						name: call.tool,
						arguments: JSON.stringify(call.args),
					});
				}
				break;
			}

			case "tool":
				result.push({
					type: "function_call_output",
					call_id: msg.toolCallId,
					output: msg.content,
				});
				break;
		}
	}

	return result;
}

export function toResponseTools(tools: ToolDefinition[]): ResponseTool[] {
	return tools.map((tool) => ({
		type: "function",
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters,
	}));
}
