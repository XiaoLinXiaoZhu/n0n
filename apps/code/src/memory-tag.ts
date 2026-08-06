import type {
	AssistantTextMessage,
	AssistantToolCallMessage,
	DomainMessage,
	LLMClient,
	StreamRequest,
} from "@n0n/types";

const MEMORY_START = "<memory>";
const MEMORY_END = "</memory>";

function tagText(text: string): string {
	return `${MEMORY_START}\n${text}\n${MEMORY_END}`;
}

function tagOptionalText(text: string): string {
	return text ? tagText(text) : text;
}

function tagReasoning(
	reasoning: AssistantTextMessage["reasoning"],
): AssistantTextMessage["reasoning"] {
	return reasoning.ok && reasoning.value
		? { ok: true, value: tagText(reasoning.value) }
		: reasoning;
}

function tagAssistantText(msg: AssistantTextMessage): AssistantTextMessage {
	return {
		...msg,
		content: tagOptionalText(msg.content),
		reasoning: tagReasoning(msg.reasoning),
	};
}

function tagAssistantToolCall(
	msg: AssistantToolCallMessage,
): AssistantToolCallMessage {
	return {
		...msg,
		content: msg.content === null ? null : tagOptionalText(msg.content),
		reasoning: tagReasoning(msg.reasoning),
	};
}

/** 为 code app 的模型请求临时包裹 assistant memory 标签，不修改持久化 history。 */
export function applyMemoryTags(messages: DomainMessage[]): DomainMessage[] {
	return messages.map((msg) => {
		switch (msg.type) {
			case "assistant_text":
				return tagAssistantText(msg);
			case "assistant_tool_call":
				return tagAssistantToolCall(msg);
			default:
				return msg;
		}
	});
}

/** 在 app 层包装 LLMClient，保持 memory 标签逻辑不进入 provider。 */
export function withMemoryTags(client: LLMClient, enabled: boolean): LLMClient {
	if (!enabled) return client;

	const wrapped: LLMClient = {
		modelId: client.modelId,
		async *stream(request: StreamRequest, signal?: AbortSignal) {
			yield* client.stream(
				{ ...request, messages: applyMemoryTags(request.messages) },
				signal,
			);
		},
		complete: (request) => client.complete(request),
		ping: () => client.ping(),
	};

	if (client.heartbeat) {
		wrapped.heartbeat = (request) =>
			client.heartbeat?.({
				...request,
				messages: applyMemoryTags(request.messages),
			}) ?? Promise.resolve(null);
	}

	return wrapped;
}
