/**
 * LLM ping 工具 — 各 Client 共用
 *
 * 通过 GET /models 端点探测 API 连通性。
 * OpenAI 兼容协议通用。
 */

import { type BaseUrl, modelsUrl } from "./base-url.ts";
import { isAbortError } from "./errors.ts";

/** ping 结果 — 判别联合，消费方通过 ok 缩窄 error */
export type PingResult = { ok: true } | { ok: false; error: string };

/**
 * 通过 GET /v1/models 探测 API 连通性。
 *
 * @param baseUrl 规范化的 API Base URL
 * @param apiKey Bearer token
 */
export async function pingModelsEndpoint(
	baseUrl: BaseUrl,
	apiKey: string,
): Promise<PingResult> {
	try {
		const url = modelsUrl(baseUrl);
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 15_000);
		const resp = await fetch(url, {
			method: "GET",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			signal: controller.signal,
		});
		clearTimeout(timeout);

		if (resp.ok) return { ok: true };

		if (resp.status === 401 || resp.status === 403) {
			return { ok: false, error: "认证失败，请检查 API Key" };
		}
		const text = await resp.text().catch(() => "");
		return {
			ok: false,
			error: `API ${resp.status}: ${text.slice(0, 200)}`,
		};
	} catch (err) {
		if (err instanceof Error) {
			if (isAbortError(err) || err.name === "TimeoutError") {
				return { ok: false, error: "连接超时（15s），请检查网络或 API 地址" };
			}
			return { ok: false, error: err.message.slice(0, 200) };
		}
		return { ok: false, error: `连接失败: ${String(err)}` };
	}
}
