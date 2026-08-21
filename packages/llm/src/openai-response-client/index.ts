/**
 * OpenAI Responses API client。
 *
 * 始终使用 store=false，并将 response output items 编码进
 * reasoningSignature。每次请求从本地历史完整重建 input，不依赖
 * previous_response_id，因此历史可以由上层正常裁剪。
 */

import type {
	CompleteRequest,
	CompleteResponse,
	LLMClient,
	StreamEvent,
	StreamRequest,
} from "@n0n/types";
import { type BaseUrl, parseBaseUrl, responsesUrl } from "../base-url.ts";
import type { OpenAIResponseProviderConfig } from "../config.ts";
import { isAbortError } from "../errors.ts";
import type { FormatFn } from "../factory.ts";
import { pingModelsEndpoint } from "../ping.ts";
import { fetchWithRetry } from "../retry.ts";
import { toResponseInput, toResponseTools } from "./format.ts";
import { parseResponseStream } from "./stream.ts";
import type {
	OpenAIResponseBody,
	OpenAIResponseRequest,
	ResponseInputItem,
} from "./types.ts";

function extractResponseText(response: OpenAIResponseBody): string {
	if (response.output_text) return response.output_text;

	const parts: string[] = [];
	for (const item of response.output ?? []) {
		if (item.type !== "message" || !Array.isArray(item.content)) continue;
		for (const content of item.content) {
			if (
				typeof content === "object" &&
				content !== null &&
				(content as Record<string, unknown>).type === "output_text" &&
				typeof (content as Record<string, unknown>).text === "string"
			) {
				parts.push((content as Record<string, unknown>).text as string);
			}
		}
	}
	return parts.join("");
}

export class OpenAIResponseClient implements LLMClient {
	readonly modelId: string;
	private readonly pc: OpenAIResponseProviderConfig;
	private readonly baseUrl: BaseUrl;
	private readonly format: FormatFn;

	constructor(pc: OpenAIResponseProviderConfig, format: FormatFn) {
		this.pc = pc;
		this.modelId = pc.model;
		this.format = format;

		const result = parseBaseUrl(pc.base_url);
		if (!result.ok) throw new Error(`无效的 base_url: ${result.error}`);
		this.baseUrl = result.baseUrl;
	}

	private headers(): Record<string, string> {
		return {
			"Content-Type": "application/json",
			Authorization: `Bearer ${this.pc.api_key}`,
		};
	}

	private makeBody(input: ResponseInputItem[]): OpenAIResponseRequest {
		return {
			model: this.modelId,
			input,
			store: false,
			include: ["reasoning.encrypted_content"],
		};
	}

	private applyExtraBody(body: OpenAIResponseRequest): void {
		if (this.pc.extra_body) Object.assign(body, this.pc.extra_body);
		const configuredInclude = Array.isArray(body.include)
			? body.include.filter(
					(value): value is string => typeof value === "string",
				)
			: [];
		// store=false 与 encrypted reasoning 是无状态续轮的协议保证。
		body.store = false;
		body.include = [
			...new Set(["reasoning.encrypted_content", ...configuredInclude]),
		];
	}

	async *stream(
		request: StreamRequest,
		signal?: AbortSignal,
	): AsyncGenerator<StreamEvent> {
		const promptMessages = this.format(request.messages);
		const body = this.makeBody(toResponseInput(promptMessages));

		if (request.tools?.length) {
			body.tools = toResponseTools(request.tools);
			body.tool_choice = request.toolChoice ?? "auto";
		}
		this.applyExtraBody(body);
		body.stream = true;

		let response: Response;
		try {
			response = await fetch(responsesUrl(this.baseUrl), {
				method: "POST",
				headers: this.headers(),
				body: JSON.stringify(body),
				signal,
			});
		} catch (error) {
			if (isAbortError(error)) return;
			yield {
				type: "error",
				error: error instanceof Error ? error.message : String(error),
			};
			return;
		}

		if (!response.ok) {
			yield {
				type: "error",
				error: `OpenAI Responses API ${response.status}: ${await response.text()}`,
			};
			return;
		}
		if (!response.body) {
			yield {
				type: "error",
				error: "OpenAI Responses streaming response has no body",
			};
			return;
		}

		yield* parseResponseStream(response.body.getReader());
	}

	async complete(request: CompleteRequest): Promise<CompleteResponse> {
		const input: ResponseInputItem[] = request.messages.map((message) => ({
			role: message.role,
			content: message.content,
		}));
		const body = this.makeBody(input);
		if (request.temperature !== undefined) {
			body.temperature = request.temperature;
		}
		this.applyExtraBody(body);
		body.stream = false;

		const response = await fetchWithRetry(() =>
			fetch(responsesUrl(this.baseUrl), {
				method: "POST",
				headers: this.headers(),
				body: JSON.stringify(body),
			}),
		);
		const json = (await response.json()) as OpenAIResponseBody;
		return { text: extractResponseText(json) };
	}

	async ping(): Promise<{ ok: boolean; error?: string }> {
		return pingModelsEndpoint(this.baseUrl, this.pc.api_key);
	}
}

export { toResponseInput, toResponseTools } from "./format.ts";
export {
	decodeResponseSignature,
	encodeResponseSignature,
} from "./signature.ts";
export { parseResponseStream } from "./stream.ts";
export type * from "./types.ts";
