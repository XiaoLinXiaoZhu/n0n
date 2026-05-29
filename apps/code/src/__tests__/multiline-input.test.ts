/**
 * multiline-input reader 测试
 *
 * 通过 connectStdin 注入按键序列，验证编辑/粘贴/提交/中断逻辑。
 * 不依赖真实 TTY——output 用 fake stream 吞掉 ANSI 写入。
 */

import { describe, expect, test } from "bun:test";
import { readMultilineInput } from "../multiline-input/reader.ts";

interface FakeStream {
	columns: number;
	rows: number;
	write: (s: string) => boolean;
	on: () => FakeStream;
	removeListener: () => FakeStream;
}

function makeFakeOut(): FakeStream {
	const out: FakeStream = {
		columns: 80,
		rows: 24,
		write: () => true,
		on: () => out,
		removeListener: () => out,
	};
	return out;
}

/** 启动一次输入会话，返回 send 函数和 result promise */
function startSession() {
	let handler: ((d: string) => void) | null = null;
	const result = readMultilineInput({
		output: makeFakeOut() as unknown as NodeJS.WriteStream,
		connectStdin: (h) => {
			handler = h;
			return () => {
				handler = null;
			};
		},
	});
	const send = (s: string) => handler?.(s);
	return { send, result };
}

describe("readMultilineInput", () => {
	test("输入文本 + 换行 + 宽字符，Alt+Enter 提交", async () => {
		const { send, result } = startSession();
		send("a");
		send("b");
		send("\r"); // Enter → 换行
		send("你好");
		send("\x1b\r"); // Alt+Enter → 提交
		const r = await result;
		expect(r).not.toBeNull();
		expect(r?.text).toBe("ab\n你好");
		expect(r?.lineCount).toBe(2);
	});

	test("Ctrl+D 提交单行", async () => {
		const { send, result } = startSession();
		send("hello");
		send("\x04"); // Ctrl+D
		const r = await result;
		expect(r?.text).toBe("hello");
		expect(r?.lineCount).toBe(1);
	});

	test("bracketed paste 跨 chunk 聚合多行", async () => {
		const { send, result } = startSession();
		send("\x1b[200~"); // pasteStart
		send("line1\nli"); // chunk 1
		send("ne2\nline3"); // chunk 2
		send("\x1b[201~"); // pasteEnd
		send("\x04"); // Ctrl+D 提交
		const r = await result;
		expect(r?.text).toBe("line1\nline2\nline3");
		expect(r?.lineCount).toBe(3);
	});

	test("Ctrl+Q 中断返回 null", async () => {
		const { send, result } = startSession();
		send("x");
		send("\x11"); // Ctrl+Q
		const r = await result;
		expect(r).toBeNull();
	});

	test("backspace 删除宽字符", async () => {
		const { send, result } = startSession();
		send("我");
		send("好");
		send("\x7f"); // backspace 删掉「好」
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("我");
	});
});
