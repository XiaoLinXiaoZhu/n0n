import type {
	CanStartFn,
	DomainMessage,
	ToolCallRecord,
	ToolDefinition,
	ToolStreamEvent,
} from "@n0n/types";
import { ZodError } from "zod";
import {
	makeUnrecoverablePair,
	type PartialToolCall,
	type RecoveredPair,
} from "./recovery.ts";

export type ToolExecutor = (
	call: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
) => AsyncGenerator<ToolStreamEvent>;

export type ToolEntry = {
	definition: ToolDefinition;
	recover?: (
		partial: PartialToolCall,
	) => Promise<{ call: ToolCallRecord; result: DomainMessage } | null>;
	canStart?: CanStartFn;
	execute: ToolExecutor;
};

type ResolveTool = (name: string) => ToolEntry | undefined;

export interface ToolJob {
	readonly call: ToolCallRecord;
	canStart(active: readonly ToolCallRecord[]): boolean;
	run(): AsyncGenerator<ToolStreamEvent>;
}

export interface ToolkitSession {
	createJob(call: ToolCallRecord): ToolJob;
	recover(partial: PartialToolCall): Promise<RecoveredPair>;
}

const defaultCanStart = (active: readonly ToolCallRecord[]): boolean =>
	active.length === 0;

function unknownToolError(call: ToolCallRecord): ToolStreamEvent {
	return {
		type: "tool_arg_error",
		callId: call.id,
		tool: call.tool,
		error: { kind: "unknown_tool" },
	};
}

function invalidArgsError(
	call: ToolCallRecord,
	entry: ToolEntry,
	err: ZodError,
): ToolStreamEvent {
	return {
		type: "tool_arg_error",
		callId: call.id,
		tool: call.tool,
		error: {
			kind: "invalid_args",
			issues: err.issues.map((issue) => ({
				path: issue.path.join("."),
				message: issue.message,
			})),
			schema: entry.definition.parameters,
		},
	};
}

async function* runEntry(
	entry: ToolEntry | undefined,
	call: ToolCallRecord,
	confirmFn?: (question: string) => Promise<string>,
): AsyncGenerator<ToolStreamEvent> {
	if (!entry) {
		yield unknownToolError(call);
		return;
	}

	try {
		yield* entry.execute(call, confirmFn);
	} catch (err) {
		if (err instanceof ZodError) {
			yield invalidArgsError(call, entry, err);
			return;
		}
		throw err;
	}
}

function createToolJob(
	resolve: ResolveTool,
	confirmFn: ((question: string) => Promise<string>) | undefined,
	call: ToolCallRecord,
): ToolJob {
	const entry = resolve(call.tool);
	return {
		call,
		canStart: (active) =>
			entry?.canStart?.(call, active) ?? defaultCanStart(active),
		run: () => runEntry(entry, call, confirmFn),
	};
}

async function recoverTool(
	resolve: ResolveTool,
	partial: PartialToolCall,
): Promise<RecoveredPair> {
	const entry = resolve(partial.toolName);
	if (!entry) {
		return makeUnrecoverablePair(partial, "unknown_tool");
	}

	try {
		const recovered = await entry.recover?.(partial);
		if (recovered) {
			return { ...recovered, status: "recovered" };
		}
	} catch {
		// recover 抛异常视同恢复失败。
	}

	return makeUnrecoverablePair(partial, "truncated_recovery");
}

export function createToolkitSession(
	resolve: ResolveTool,
	confirmFn?: (question: string) => Promise<string>,
): ToolkitSession {
	return {
		createJob: (call) => createToolJob(resolve, confirmFn, call),
		recover: (partial) => recoverTool(resolve, partial),
	};
}
