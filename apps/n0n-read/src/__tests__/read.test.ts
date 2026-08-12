import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readText } from "../index.ts";

function tempFile(content: string): string {
	const dir = mkdtempSync(join(tmpdir(), "n0n-read-"));
	const path = join(dir, "input.txt");
	writeFileSync(path, content);
	return path;
}

describe("n0n read", () => {
	test("游标读取可无遗漏重组单行 UTF-8 文本", () => {
		const original = `前缀-${"🙂abc中文".repeat(300)}-结尾`;
		const path = tempFile(original);
		let cursor = 0;
		let rebuilt = "";

		for (let i = 0; i < 100; i++) {
			const result = readText({ path, cursor, tokens: 50 });
			rebuilt += result.text;
			if (result.metadata.eof) break;
			expect(result.metadata.nextCursor).not.toBeNull();
			const nextCursor = result.metadata.nextCursor;
			if (nextCursor === null) throw new Error("missing nextCursor");
			cursor = nextCursor;
		}

		expect(rebuilt).toBe(original);
	});

	test("stdin 与文件使用相同的预算读取契约", () => {
		const source = Buffer.from("alpha beta gamma delta ".repeat(100));
		const fromStdin = readText({ stdin: source, tokens: 20 });
		const fromFile = readText({
			path: tempFile(source.toString("utf8")),
			tokens: 20,
		});

		expect(fromStdin.text).toBe(fromFile.text);
		expect(fromStdin.metadata.tokens).toBeLessThanOrEqual(20);
		expect(fromStdin.metadata.eof).toBe(false);
	});

	test("行范围为包含首尾的 1-based 范围", () => {
		const result = readText({
			stdin: Buffer.from("one\ntwo\nthree\nfour"),
			lines: { start: 2, end: 3 },
		});
		expect(result.text).toBe("two\nthree");
		expect(result.metadata.limit).toBe("lines");
	});

	test("tail 返回预算内的文件末尾", () => {
		const path = tempFile(`${"old ".repeat(500)}THE_END`);
		const result = readText({ path, tail: true, tokens: 20 });
		expect(result.text).toContain("THE_END");
		expect(result.metadata.eof).toBe(true);
		expect(result.metadata.tokens).toBeLessThanOrEqual(20);
	});

	test("互斥模式和无效预算被拒绝", () => {
		expect(() =>
			readText({
				stdin: Buffer.from("x"),
				cursor: 0,
				lines: { start: 1, end: 1 },
			}),
		).toThrow("mutually exclusive");
		expect(() => readText({ stdin: Buffer.from("x"), tokens: 0 })).toThrow(
			"positive integer",
		);
	});
});
