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

	test("bracketed paste 整段单 chunk 聚合", async () => {
		const { send, result } = startSession();
		// 真实终端常把 \x1b[200~<内容>\x1b[201~ 作为单个 chunk 发送
		send("\x1b[200~hello world\x1b[201~");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("hello world");
		expect(r?.lineCount).toBe(1);
	});

	test("bracketed paste 整段单 chunk 含换行", async () => {
		const { send, result } = startSession();
		send("\x1b[200~line1\nline2\nline3\x1b[201~");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("line1\nline2\nline3");
		expect(r?.lineCount).toBe(3);
	});

	test("bracketed paste 前后混入普通字符同 chunk", async () => {
		const { send, result } = startSession();
		send("a\x1b[200~PASTED\x1b[201~b");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("aPASTEDb");
		expect(r?.lineCount).toBe(1);
	});

	test("bracketed paste 内容含 CRLF 规范化为 LF", async () => {
		const { send, result } = startSession();
		send("\x1b[200~a\r\nb\r\nc\x1b[201~");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("a\nb\nc");
		expect(r?.lineCount).toBe(3);
	});

	test("bracketed paste 内容含裸 CR 规范化为 LF", async () => {
		const { send, result } = startSession();
		send("\x1b[200~a\rb\rc\x1b[201~");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("a\nb\nc");
		expect(r?.lineCount).toBe(3);
	});

	test("bracketed paste 起始标记被 chunk 边界拆开", async () => {
		const { send, result } = startSession();
		send("\x1b["); // 起始标记前半
		send("200~hello\x1b[201~"); // 后半 + 内容 + 结束
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("hello");
		expect(r?.lineCount).toBe(1);
	});

	test("bracketed paste 结束标记被 chunk 边界拆开", async () => {
		const { send, result } = startSession();
		send("\x1b[200~hello\x1b["); // 起始 + 内容 + 结束标记前半
		send("201~"); // 结束标记后半
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("hello");
		expect(r?.lineCount).toBe(1);
	});

	test("bracketed paste 细碎分片（以 \\x1b[ 为边界）正确聚合且不残留标记", async () => {
		const { send, result } = startSession();
		// 模拟终端把 paste 序列拆成多个 chunk，但每个转义序列从 \x1b[ 整体开始
		send("\x1b[");
		send("200~x\r");
		send("y");
		send("\x1b[");
		send("201~");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("x\ny");
		expect(r?.lineCount).toBe(2);
	});

	test("孤立 ESC 键不被 paste 预处理吞掉（仍可被忽略而不残留）", async () => {
		const { send, result } = startSession();
		send("a");
		send("\x1b"); // 单独 ESC：不应被 hold，按 escape 处理（输入态下被忽略）
		send("b");
		send("\x04");
		const r = await result;
		expect(r?.text).toBe("ab");
		expect(r?.lineCount).toBe(1);
	});

	test("Ctrl+Q 中断返回 null", async () => {
		const { send, result } = startSession();
		send("x");
		send("\x11"); // Ctrl+Q
		const r = await result;
		expect(r).toBeNull();
	});

	test("Ctrl+C 被静默忽略，会话继续", async () => {
		const { send, result } = startSession();
		send("x");
		send("\x03"); // Ctrl+C should be ignored
		send("y");
		send("\x04"); // Ctrl+D 提交
		const r = await result;
		expect(r?.text).toBe("xy");
		expect(r?.lineCount).toBe(1);
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
