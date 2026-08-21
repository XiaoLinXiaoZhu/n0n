import type { ResponseOutputItem } from "./types.ts";

const SIGNATURE_PREFIX = "openai-response:v1:";

interface OpenAIResponseSignatureEnvelope {
	version: 1;
	outputItems: ResponseOutputItem[];
}

function isOutputItem(value: unknown): value is ResponseOutputItem {
	return (
		typeof value === "object" &&
		value !== null &&
		typeof (value as Record<string, unknown>).type === "string"
	);
}

/** 将 Responses output items 编码进通用 reasoningSignature 字段。 */
export function encodeResponseSignature(
	outputItems: ResponseOutputItem[],
): string {
	const envelope: OpenAIResponseSignatureEnvelope = {
		version: 1,
		outputItems,
	};
	return `${SIGNATURE_PREFIX}${JSON.stringify(envelope)}`;
}

/**
 * 解码本 provider 的签名。
 *
 * 其他 provider 的签名或损坏数据返回 undefined，由 formatter 降级为
 * 普通 assistant 消息重建，避免历史文件损坏导致整个会话不可用。
 */
export function decodeResponseSignature(
	signature: string | undefined,
): ResponseOutputItem[] | undefined {
	if (!signature?.startsWith(SIGNATURE_PREFIX)) return undefined;

	try {
		const parsed: unknown = JSON.parse(
			signature.slice(SIGNATURE_PREFIX.length),
		);
		if (typeof parsed !== "object" || parsed === null) return undefined;
		const envelope = parsed as Record<string, unknown>;
		if (envelope.version !== 1 || !Array.isArray(envelope.outputItems)) {
			return undefined;
		}
		if (!envelope.outputItems.every(isOutputItem)) return undefined;
		return envelope.outputItems;
	} catch {
		return undefined;
	}
}
