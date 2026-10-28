/**
 * post 工具 URI 解析 — 三种 scheme 的路由契约
 *
 * `exec://<runtime>/<claim>`、`write://<path>`、`customer://<kind>`。
 * 纯函数，无副作用；畸形或不支持的 uri 一律抛错，调用方在 execute 分发前
 * 负责把错误转成 tool_arg_error。
 */

import type { CustomerKind } from "@n0n/types";

/** waitfor 硬上限（秒），与工具描述保持一致 */
const WAITFOR_MAX = 240;

export type ParsedUri =
	| {
			scheme: "exec";
			/** uri 中的 runtime 段（URL 解码后） */
			runtime: string;
			/** uri 中的 NAME 段（URL 解码后），模型自述当前步骤 */
			claim: string;
			cwd?: string;
			waitfor?: number;
			maxOutputTokens?: number;
	  }
	| {
			scheme: "write";
			/** URL 解码后的文件路径 */
			path: string;
	  }
	| {
			scheme: "customer";
			kind: CustomerKind;
	  };

const SUPPORTED_SCHEMES = ["exec://", "write://", "customer://"] as const;

const CUSTOMER_KINDS: readonly CustomerKind[] = [
	"question",
	"form",
	"action_required",
];

function decodeSegment(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		// 非法 % 转义：原样返回，交给后续校验决定是否报错
		return raw;
	}
}

function parseQuery(query: string): {
	cwd?: string;
	waitfor?: number;
	maxOutputTokens?: number;
} {
	const out: { cwd?: string; waitfor?: number; maxOutputTokens?: number } = {};
	if (!query) return out;

	for (const pair of query.split("&")) {
		if (!pair) continue;
		const eq = pair.indexOf("=");
		const key = eq === -1 ? pair : pair.slice(0, eq);
		const rawValue = eq === -1 ? "" : pair.slice(eq + 1);
		const value = decodeSegment(rawValue);

		switch (key) {
			case "cwd":
				out.cwd = value;
				break;
			case "waitfor": {
				const n = Number(value);
				if (Number.isFinite(n) && n > 0) {
					out.waitfor = Math.min(n, WAITFOR_MAX);
				}
				break;
			}
			case "max_output_tokens": {
				const n = Number(value);
				if (Number.isFinite(n) && n > 0) {
					out.maxOutputTokens = Math.floor(n);
				}
				break;
			}
			default:
				// 未知查询键忽略——uri 是路由地址，未知键不阻断执行
				break;
		}
	}
	return out;
}

/**
 * 解析 post 工具的 uri。
 *
 * @throws Error 畸形或不支持的 uri（消息中列出三种受支持的 scheme）。
 */
export function parsePostUri(uri: string): ParsedUri {
	if (typeof uri !== "string" || uri.length === 0) {
		throw new Error(
			`Empty uri. Supported schemes: ${SUPPORTED_SCHEMES.join(", ")}.`,
		);
	}

	const schemeEnd = uri.indexOf("://");
	if (schemeEnd === -1) {
		throw new Error(
			`Malformed uri "${uri}". Expected scheme://... — supported schemes: ${SUPPORTED_SCHEMES.join(", ")}.`,
		);
	}

	const scheme = uri.slice(0, schemeEnd).toLowerCase();
	const rest = uri.slice(schemeEnd + 3);

	switch (scheme) {
		case "exec": {
			// authority 是 runtime；其后首个 / 之后为 claim（可含 /）
			const slash = rest.indexOf("/");
			if (slash <= 0) {
				throw new Error(
					`Malformed exec uri "${uri}". Expected exec://<runtime>/<claim>.`,
				);
			}
			const runtime = decodeSegment(rest.slice(0, slash));
			const remainder = rest.slice(slash + 1);
			if (!runtime) {
				throw new Error(
					`Malformed exec uri "${uri}". Missing runtime segment.`,
				);
			}

			const q = remainder.indexOf("?");
			const claimPart = q === -1 ? remainder : remainder.slice(0, q);
			const queryPart = q === -1 ? "" : remainder.slice(q + 1);
			const claim = decodeSegment(claimPart);
			if (!claim) {
				throw new Error(
					`Malformed exec uri "${uri}". Missing claim (NAME) segment.`,
				);
			}

			return { scheme: "exec", runtime, claim, ...parseQuery(queryPart) };
		}

		case "write": {
			// write:// 之后全部是路径（URL 解码），无 query 语义
			const path = decodeSegment(rest);
			if (!path) {
				throw new Error(`Malformed write uri "${uri}". Missing path.`);
			}
			return { scheme: "write", path };
		}

		case "customer": {
			// customer:// 之后全部是 kind，必须精确匹配
			const kindPart = decodeSegment(rest);
			const kind = CUSTOMER_KINDS.find((k) => k === kindPart);
			if (!kind) {
				throw new Error(
					`Malformed customer uri "${uri}". Expected one of: ${CUSTOMER_KINDS.join(", ")}.`,
				);
			}
			return { scheme: "customer", kind };
		}

		default:
			throw new Error(
				`Unsupported uri scheme "${scheme}:" in "${uri}". Supported schemes: ${SUPPORTED_SCHEMES.join(", ")}.`,
			);
	}
}
