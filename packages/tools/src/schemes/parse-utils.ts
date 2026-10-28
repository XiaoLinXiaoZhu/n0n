/**
 * uri 解析共享工具 — 各 scheme 模块的 parse 实现复用
 */

/** URL 解码单段；非法 % 转义原样返回，交给后续校验决定是否报错 */
export function decodeSegment(raw: string): string {
	try {
		return decodeURIComponent(raw);
	} catch {
		return raw;
	}
}

/** waitfor 硬上限（秒），与工具描述保持一致 */
export const WAITFOR_MAX = 240;

/**
 * 用作文件名的单段是否不安全（路径穿越/分隔符/控制字符/Windows 危险字符）。
 * 消费方在边界（parse）调用——文件名段不允许不确定性流入存储层。
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: 安全边界——显式拒绝控制字符正是意图
const UNSAFE_FILENAME_SEGMENT = /[\\/\0-\x1f\x7f<>:"|?*]/;

export function isUnsafeFilenameSegment(segment: string): boolean {
	return (
		UNSAFE_FILENAME_SEGMENT.test(segment) || segment === "." || segment === ".."
	);
}

/** exec:// 的 query 解析：cwd / waitfor（clamp ≤240）/ max_output_tokens（floor） */
export function parseExecQuery(query: string): {
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
