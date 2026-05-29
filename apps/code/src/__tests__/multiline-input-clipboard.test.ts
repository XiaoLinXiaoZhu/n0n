/**
 * clipboard 粘贴换行规范化测试
 *
 * pasteFromClipboard 依赖系统命令（powershell/pbpaste/xclip），不做单测；
 * normalizePastedText 是纯函数，验证 \r\n / 裸 \r 都被统一为 \n。
 */

import { describe, expect, test } from "bun:test";
import { normalizePastedText } from "../multiline-input/clipboard.ts";

describe("normalizePastedText 换行规范化", () => {
	test("CRLF 转 LF", () => {
		expect(normalizePastedText("a\r\nb\r\nc")).toBe("a\nb\nc");
	});

	test("裸 CR 转 LF", () => {
		expect(normalizePastedText("a\rb\rc")).toBe("a\nb\nc");
	});

	test("CRLF 与裸 CR 混合", () => {
		expect(normalizePastedText("a\r\nb\rc\nd")).toBe("a\nb\nc\nd");
	});

	test("已是 LF 不变", () => {
		expect(normalizePastedText("a\nb\nc")).toBe("a\nb\nc");
	});

	test("无换行原样返回", () => {
		expect(normalizePastedText("hello world")).toBe("hello world");
	});

	test("含中文宽字符保持完整", () => {
		expect(normalizePastedText("你好\r\n世界")).toBe("你好\n世界");
	});
});
