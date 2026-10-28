/**
 * SchemeHandler 接口 — post 工具各 uri scheme 的自治模块契约
 *
 * 两层结构的第二层：每个 scheme 模块自带 uri 模板、描述文案、解析规则、
 * 执行、恢复能力与调度事实。post 入口（传输层）只按注册表分发，不含任何
 * scheme 知识。
 *
 * 设计约束：
 * - scheme 模块**声明事实**（exclusive / resourceKey），不写命令式调度规则；
 *   调度策略解释器留在 post 层（index.ts），避免策略碎片化。
 * - parse 是各模块内唯一允许抛错的位置（边界即解析）；execute 及更内层
 *   签名全 total，不重复解析、不抛错。
 * - describe 返回空数组表示本模式下隐藏该 scheme（allowCustomer 复用此机制）。
 */

import type {
	DomainMessage,
	ToolCallRecord,
	ToolStreamEvent,
} from "@n0n/types";
import type { ExtractedPartial } from "../recovery.ts";

export type { ExtractedPartial } from "../recovery.ts";

/** SchemeContext — 由 ToolsConfig 裁剪的平面配置，handler 按需取字段 */
export interface SchemeContext {
	platform: "win32" | "darwin" | "linux";
	workspace: string;
	sessionDir: string;
	blocked_commands: string[];
	default_exec_waitfor: number;
	max_exec_output_tokens: number;
	bgSyncIntervalMs?: number;
	allowCustomer: boolean;
}

/** recover 产物：完整 call + 结果消息（与 ToolEntry.recover 返回一致） */
export interface RecoveredExecute {
	call: ToolCallRecord;
	result: DomainMessage;
}

/**
 * scheme 处理器 — 注册表成员。
 *
 * 泛型 P 为本 scheme 的解析产物（带 scheme 字面量的判别成员），
 * 由 parse 产出并向 execute 单向传递（parse-don't-validate）。
 */
export interface SchemeHandler<P extends { scheme: string }> {
	/** scheme 字面量，同时用于与 uriPrefix 互查 */
	readonly scheme: P["scheme"];
	/** uri 前缀，如 "exec://"；描述与错误消息由注册表统一生成 */
	readonly uriPrefix: string;
	/** body 语义的一句话（用于参数描述拼接） */
	readonly bodyHint: string;
	/** 本 scheme 的描述段落；空数组 = 本模式下隐藏 */
	describe(ctx: SchemeContext): string[];
	/**
	 * 解析 uri 的 authority+path+query 部分（"scheme://" 之后）。
	 *
	 * @throws Error 畸形 uri — 注册表边界捕获后转 tool_arg_error。
	 */
	parse(rest: string, fullUri: string): P;
	/** 调度事实：独占（不得与任何调用并行） */
	readonly exclusive?: boolean;
	/** 调度事实：资源锁 key — 同 key 串行；null/缺省表示无共享资源 */
	resourceKey?(parsed: P): string | null;
	/** 执行后端；parsed 已由边界解析，不得再解析 call.args.uri */
	execute(
		parsed: P,
		call: ToolCallRecord,
		ctx: SchemeContext,
		confirmFn?: (question: string) => Promise<string>,
	): AsyncGenerator<ToolStreamEvent>;
	/** 截断恢复能力；缺省 = 该 scheme 的部分参数不可恢复 */
	recover?(
		extracted: ExtractedPartial,
		toolCallId: string,
		ctx: SchemeContext,
	): Promise<RecoveredExecute | null>;
}
