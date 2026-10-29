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

/** 从截断 JSON 参数中提取出的 uri + body（scheme recover 的输入） */
export interface ExtractedPartial {
  uri: string;
  body: string;
}

/**
 * 尝试从截断的 post 工具 JSON 参数中提取 uri 和 body。
 *
 * post 参数格式为 {"uri":"...","body":"..."}。
 * 当 body 被 max_tokens 截断时，JSON 不完整，但 uri 和部分 body 仍可恢复。
 * 返回 null 表示无法提取（uri 未找到）。
 *
 * 注意：当前只处理基础 JSON 转义（\n \t \r \" \\），
 * 未处理 \uXXXX unicode 转义。目前未观测到实际问题。
 */
export function extractUriBody(partialJson: string): ExtractedPartial | null {
  const uriMatch = partialJson.match(/"uri"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (!uriMatch?.[1]) return null;

  const uri = uriMatch[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  if (!uri) return null;

  const bodyStart = partialJson.indexOf('"body"');
  if (bodyStart === -1) return { uri, body: "" };

  const valueStart = partialJson.indexOf('"', bodyStart + '"body"'.length + 1);
  if (valueStart === -1) return { uri, body: "" };

  // 从 body 值的开始引号之后扫描，寻找未转义的闭合引号
  const afterQuote = partialJson.slice(valueStart + 1);
  let rawBody: string;

  // 扫描闭合引号：逐字符检查，跳过 \" 转义
  let closeIdx = -1;
  for (let i = 0; i < afterQuote.length; i++) {
    if (afterQuote[i] === "\\") {
      i++;
      continue;
    } // 跳过转义字符
    if (afterQuote[i] === '"') {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx !== -1) {
    // 找到闭合引号：截取引号之前的内容（完整 body 值）
    rawBody = afterQuote.slice(0, closeIdx);
  } else {
    // 未找到闭合引号：body 确实被截断，取到末尾并清理尾部不完整转义
    rawBody = afterQuote.replace(/\\?$/, "");
  }

  const body = rawBody
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\r/g, "\r")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");

  return { uri, body };
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
