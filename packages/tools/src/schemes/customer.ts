/**
 * customer scheme — 向客户提问/请求填写/请求操作
 *
 * body 是发给客户的消息正文。产出 CustomerCompleted 结果并中断 agent 循环，
 * 由消费层（repl）渲染后等待客户响应。
 *
 * uri 模板：customer://<kind>[/<slug>]
 * - kind ∈ question | form | action_required
 * - slug 可选，单段；消费层用它命名会话输出记录文件（无 slug 时退化为 kind）
 *
 * 调度事实：独占（打断循环，不得与任何调用并行）。
 * 恢复能力：无（消息被截断则不可恢复）。
 * 可见性：describe 在 allowCustomer=false 时返回空数组（oneshot 模式隐藏），
 * execute 同时以 arg-error 拒绝——描述层与执行层双重把关。
 */

import type { CustomerCompleted, CustomerKind } from "@n0n/types";

import { decodeSegment, isUnsafeFilenameSegment } from "./parse-utils.ts";
import type { SchemeHandler } from "./types.ts";

/** customer:// 的解析产物 */
export interface ParsedCustomer {
  scheme: "customer";
  kind: CustomerKind;
  /** 可选 slug 段（URL 解码后）；无 slug 时为 null */
  slug: string | null;
}

const CUSTOMER_KINDS: readonly CustomerKind[] = [
  "question",
  "form",
  "action_required",
];

export const customerScheme: SchemeHandler<ParsedCustomer> = {
  scheme: "customer",
  uriPrefix: "customer://",
  bodyHint: "the message text for customer://",
  exclusive: true,

  describe(ctx) {
    if (!ctx.allowCustomer) return [];
    return [
      "customer — customer://question | customer://form | customer://action_required . Optionally append /<slug> after the kind (e.g. customer://question/choose-approach) to name this pause in the session output records; without a slug the kind is used. Body is the message to the customer. This interrupts the agent loop and waits for the customer to respond. question is a multiple-choice question with a recommended pick; form requests specific information; action_required is something the customer must do.",
    ];
  },

  parse(rest, fullUri) {
    // kind 是首段；其后可选单段 slug
    const slash = rest.indexOf("/");
    const kindPart = slash === -1 ? rest : rest.slice(0, slash);
    const kind = CUSTOMER_KINDS.find((k) => k === decodeSegment(kindPart));
    if (!kind) {
      throw new Error(
        `Malformed customer uri "${fullUri}". Expected one of: ${CUSTOMER_KINDS.join(", ")} (optionally followed by /<slug>).`,
      );
    }

    let slug: string | null = null;
    if (slash !== -1) {
      const rawSlug = rest.slice(slash + 1);
      if (rawSlug.includes("/")) {
        throw new Error(
          `Malformed customer uri "${fullUri}". Slug must be a single segment.`,
        );
      }
      const decoded = decodeSegment(rawSlug);
      // 尾部斜杠（customer://question/）视为无 slug
      if (decoded) {
        if (isUnsafeFilenameSegment(decoded)) {
          throw new Error(
            `Malformed customer uri "${fullUri}". Slug must be a plain name (no path separators or control characters).`,
          );
        }
        slug = decoded;
      }
    }

    return { scheme: "customer", kind, slug };
  },

  async *execute(parsed, call, ctx) {
    if (ctx.allowCustomer === false) {
      yield {
        type: "tool_arg_error",
        callId: call.id,
        tool: "post",
        error: {
          kind: "invalid_args",
          issues: [
            {
              path: "uri",
              message: "customer:// is not available in this mode.",
            },
          ],
        },
      };
      return;
    }
    const result: CustomerCompleted = {
      type: "tool_result",
      tool: "post",
      call,
      status: "completed",
      scheme: "customer",
      kind: parsed.kind,
      slug: parsed.slug,
    };
    yield result;
  },
};
