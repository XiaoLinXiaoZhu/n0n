/**
 * 规范化的 API Base URL — 保证是合法的 URL 对象且不含尾部 /v1、/messages、/responses、/chat/completions 和 /。
 *
 * Branded type：URL 子类型，可直接用于 fetch()。
 * 只能通过 parseBaseUrl 构造，类型系统保证下游不会误用原始字符串。
 */
declare const BaseUrlBrand: unique symbol;
export type BaseUrl = URL & { [BaseUrlBrand]: true };

export type BaseUrlResult =
	| { ok: true; baseUrl: BaseUrl }
	| { ok: false; error: string };

/**
 * 将原始 base_url 字符串解析为规范化的 BaseUrl。
 *
 * 兼容三种输入形式：
 * - 纯 base：https://api.openai.com
 * - 带 /v1：https://api.openai.com/v1
 * - 完整端点：https://api.openai.com/v1/chat/completions
 *
 * 内部用 new URL() 验证合法性，非法 URL 返回 error。
 */
export function parseBaseUrl(raw: string): BaseUrlResult {
	const normalized = raw
		.replace(/\/chat\/completions\/?$/, "")
		.replace(/\/messages\/?$/, "")
		.replace(/\/responses\/?$/, "")
		.replace(/\/v1\/?$/, "")
		.replace(/\/$/, "");

	try {
		const url = new URL(normalized);
		return { ok: true, baseUrl: url as BaseUrl };
	} catch {
		return { ok: false, error: `无效的 base_url: "${raw}"` };
	}
}

/** 基于 baseUrl.pathname 拼接路径，避免绝对路径覆盖 base URL 的路径前缀 */
function appendPath(baseUrl: BaseUrl, suffix: string): URL {
	const basePath = baseUrl.pathname.replace(/\/$/, "");
	return new URL(`${basePath}${suffix}`, baseUrl);
}

/** Chat Completions 端点（OpenAI 兼容协议） */
export function chatCompletionsUrl(baseUrl: BaseUrl): URL {
	return appendPath(baseUrl, "/v1/chat/completions");
}

/** Responses 端点 */
export function responsesUrl(baseUrl: BaseUrl): URL {
	return appendPath(baseUrl, "/v1/responses");
}

/** Messages 端点（Anthropic 协议） */
export function messagesUrl(baseUrl: BaseUrl): URL {
	return appendPath(baseUrl, "/v1/messages");
}

/** Models 端点（GET /v1/models，用于 ping） */
export function modelsUrl(baseUrl: BaseUrl): URL {
	return appendPath(baseUrl, "/v1/models");
}
