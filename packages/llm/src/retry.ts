/**
 * LLM 请求重试工具
 *
 * 指数退避重试逻辑，被各 Client 的 complete() 方法共用。
 */

import { LLMError } from "./errors.ts";

/**
 * 执行异步操作，失败时按指数退避重试。
 *
 * 重试条件：HTTP 429（限流）或 5xx（服务端错误）。
 * 非重试错误直接抛出（不重试）。
 *
 * @param fn 异步操作，返回 HTTP Response
 * @param maxRetries 最大重试次数（默认 3）
 * @returns Response（已校验 ok）
 */
export async function fetchWithRetry(
	fn: () => Promise<Response>,
	maxRetries = 3,
): Promise<Response> {
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (attempt > 0) {
			const delay = Math.min(1000 * 2 ** attempt, 10_000);
			await new Promise((r) => setTimeout(r, delay));
		}

		try {
			const res = await fn();

			if (!res.ok) {
				const text = await res.text().catch(() => "");
				if (res.status === 429 || res.status >= 500) {
					lastError = new LLMError(
						`LLM API ${res.status}: ${text}`,
						res.status,
						text,
					);
					continue;
				}
				throw new LLMError(`LLM API ${res.status}: ${text}`, res.status, text);
			}

			return res;
		} catch (err) {
			if (err instanceof LLMError) throw err;
			lastError = err instanceof Error ? err : new Error(String(err));
		}
	}

	throw lastError ?? new Error("LLM request failed after retries");
}
