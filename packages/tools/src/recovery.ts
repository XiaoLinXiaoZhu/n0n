import type {
	DomainMessage,
	PartialToolCallRecord,
	ToolCallRecord,
} from "@n0n/types";

/** LLM 输出被截断时保留的工具调用状态。 */
export interface PartialToolCall {
	index: number;
	toolCallId: string;
	toolName: string;
	partialInput: string;
}

export interface RecoveredCall {
	status: "recovered";
	call: ToolCallRecord;
	result: DomainMessage;
}

export interface UnrecoverableCall {
	status: "unrecoverable";
	call: PartialToolCallRecord;
	result: DomainMessage;
}

export type RecoveredPair = RecoveredCall | UnrecoverableCall;

export function makeUnrecoverablePair(
	partial: PartialToolCall,
	kind: "unknown_tool" | "truncated_recovery",
): UnrecoverableCall {
	return {
		status: "unrecoverable",
		call: {
			id: partial.toolCallId,
			tool: partial.toolName,
			args: {},
		},
		result: {
			type: "tool_arg_error",
			callId: partial.toolCallId,
			tool: partial.toolName,
			error: { kind },
		},
	};
}

export type ToolRecover = (partial: PartialToolCall) => Promise<RecoveredPair>;
