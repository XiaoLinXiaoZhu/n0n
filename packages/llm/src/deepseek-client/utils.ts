/**
 * 文段改写工具 — 按换行拆分文段，替换第一人称开头短语
 *
 * 英文 "Let me" / "Let's" / "Let us"（含大小写变体）→ "We need to"；
 * 中文 "让我" / "让我来" → "我们需要"。
 *
 * 替换文本固定，不做大小写自适应；段内所有出现处均替换。
 */

/** 英文替换表 — 短语前后须为非英文字母，避免命中 "Let meander" 这类单词内部 */
const ENGLISH_REPLACEMENTS: readonly [RegExp, string][] = [
	[/(?<![A-Za-z])Let us(?![A-Za-z])/gi, "We need to"],
	[/(?<![A-Za-z])Let's(?![A-Za-z])/gi, "We need to"],
	[/(?<![A-Za-z])Let me(?![A-Za-z])/gi, "We need to"],
];

/** 中文替换表 — "让我来" 须在 "让我" 之前匹配，否则会残留 "来" 字 */
const CHINESE_REPLACEMENTS: readonly [RegExp, string][] = [
	[/让我来/g, "我们需要"],
	[/让我/g, "我们需要"],
];

/** 按换行拆分文段，逐段替换所有命中的短语后重新拼接 */
export function rewriteParagraphs(text: string): string {
	return text
		.split("\n")
		.map((paragraph) => {
			let result = paragraph;
			for (const [pattern, replacement] of ENGLISH_REPLACEMENTS) {
				result = result.replace(pattern, replacement);
			}
			for (const [pattern, replacement] of CHINESE_REPLACEMENTS) {
				result = result.replace(pattern, replacement);
			}
			return result;
		})
		.join("\n");
}
