/**
 * tool-recovery — 流式输出截断时的工具调用恢复
 *
 * 当 LLM 输出被 max_tokens 截断或异常中断时，部分工具调用的 JSON 参数可能不完整。
 * 本模块对每个截断工具逐一恢复并执行：
 *
 * - 工具名/ID 都解析不出来 → 跳过（当这个工具没有被调用过）
 * - 能识别工具 →
 *   - 有 recover 函数 → 调用 recover（恢复参数+执行），拿到 call + result
 *   - 无 recover 函数 → 生成 tool_arg_error 作为 result
 *
 * 输出统一为 (call, result) 对的列表。loop 不需要关心具体工具类型。
 */

import type {
	DomainMessage,
	PartialToolCallRecord,
	ToolCallRecord,
} from "@n0n/types";

/** 截断分析的输入：某个工具调用的累积状态 */
export interface PartialToolCall {
	index: number;
	toolCallId: string;
	toolName: string;
	/** 已接收的部分 JSON 参数 */
	partialInput: string;
}

/** 恢复成功：call 是完整的 ToolCallRecord，result 是工具执行结果 */
export interface RecoveredCall {
	status: "recovered";
	call: ToolCallRecord;
	result: DomainMessage;
}

/** 恢复失败：call 是占位记录（仅 id/tool 有效，args 无意义），result 是 tool_arg_error */
export interface UnrecoverableCall {
	status: "unrecoverable";
	/** 占位 call — 仅 id 和 tool 字段有意义，args 为空对象。
	 *  用于保持 assistant_tool_call 消息结构与 tool_arg_error result 的配对完整性。 */
	call: PartialToolCallRecord;
	result: DomainMessage;
}

/** 单个截断工具的恢复结果 — 判别联合 */
export type RecoveredPair = RecoveredCall | UnrecoverableCall;

/** 截断恢复的输出 */
export interface RecoveryResult {
	/** 所有截断工具的 (call, result) 对 — 无论恢复成功还是失败 */
	pairs: RecoveredPair[];
}

/** 单个截断调用的恢复行为。 */
export type RecoverPartialFn = (
	partial: PartialToolCall,
) => Promise<RecoveredPair>;

/** 为无法恢复的调用构造占位结果。 */
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
