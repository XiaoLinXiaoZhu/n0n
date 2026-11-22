/**
 * OpenCode Client — 通过 OpenAI Chat Completions 兼容协议通信
 *
 * 处理 provider="opencode" / "opencode-go"（OpenCode Go 网关）。
 * 在 OpenAI 兼容请求基础上注入 User-Agent 与稳定的 x-opencode-session 头。
 */
import type {
  CompleteRequest,
  CompleteResponse,
  LLMClient,
  StreamEvent,
  StreamRequest,
} from "@n0n/types";

import { type BaseUrl, chatCompletionsUrl, parseBaseUrl } from "../base-url.ts";
import type { OpencodeProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { filterEmptyMessages } from "../message-filter.ts";
import {
  toOpenAIMessages,
  toOpenAITools,
} from "../openai-compatible-client/format.ts";
import type { OpenAIRequest } from "../openai-compatible-client/types.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { parseChatCompletionText } from "../schemas.ts";
import { chunkToStreamEvents, runSSEStream } from "../sse-utils.ts";

export {
  toOpenAIMessages,
  toOpenAITools,
} from "../openai-compatible-client/format.ts";
export type {
  OpenAIMessage,
  OpenAIRequest,
  OpenAIToolCall,
  OpenAIToolDef,
} from "../openai-compatible-client/types.ts";

export class OpencodeClient implements LLMClient {
  readonly modelId: string;
  private readonly apiKey: string;
  private readonly baseUrl: BaseUrl;
  private readonly format: FormatFn;
  private readonly backendProvider: string | undefined;
  private readonly extraBody: Record<string, unknown> | undefined;
  private readonly extraHeaders: Record<string, string> | undefined;
  private readonly sessionId: string;
  private readonly userAgent: string;

  constructor(pc: OpencodeProviderConfig, format: FormatFn) {
    this.modelId = pc.model;
    this.apiKey = pc.api_key;
    this.format = format;
    this.backendProvider = pc.backend_provider;
    this.extraBody = pc.extra_body;
    this.extraHeaders = pc.extra_headers;
    this.sessionId = `ses_${crypto.randomUUID().replace(/-/g, "")}`;
    this.userAgent = "n0n/1.0";

    const result = parseBaseUrl(pc.base_url);
    if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
    this.baseUrl = result.baseUrl;
  }

  private headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
      "User-Agent": this.userAgent,
      "x-opencode-session": this.sessionId,
      ...(this.extraHeaders ?? {}),
    };
  }

  async *stream(
    request: StreamRequest,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    const promptMessages = this.format(request.messages);
    const apiMessages = toOpenAIMessages(promptMessages, this.backendProvider);

    const filteredMessages = filterEmptyMessages(apiMessages);

    const body: OpenAIRequest = {
      model: this.modelId,
      messages: filteredMessages,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (request.tools?.length) {
      body.tools = toOpenAITools(request.tools);
      body.tool_choice = request.toolChoice ?? "auto";
    }

    if (this.extraBody) {
      Object.assign(body, this.extraBody);
    }

    let res: Response;
    try {
      res = await fetch(chatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (isAbortError(err)) return;
      yield {
        type: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      return;
    }

    if (!res.ok) {
      const text = await res.text();
      yield { type: "error", error: `LLM API ${res.status}: ${text}` };
      return;
    }

    if (!res.body) {
      yield { type: "error", error: "LLM streaming response has no body" };
      return;
    }

    yield* runSSEStream(res.body.getReader(), chunkToStreamEvents);
  }

  async complete(request: CompleteRequest): Promise<CompleteResponse> {
    const messages = request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const body: OpenAIRequest = {
      model: this.modelId,
      messages,
      stream: false,
    };

    if (request.temperature !== undefined) {
      body.temperature = request.temperature;
    }

    if (this.extraBody) {
      Object.assign(body, this.extraBody);
    }

    const res = await fetchWithRetry(() =>
      fetch(chatCompletionsUrl(this.baseUrl), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
      }),
    );

    const json: unknown = await res.json();
    return { text: parseChatCompletionText(json) };
  }

  async ping(): Promise<{ ok: boolean; error?: string }> {
    return pingModelsEndpoint(this.baseUrl, this.apiKey, this.headers());
  }
}
