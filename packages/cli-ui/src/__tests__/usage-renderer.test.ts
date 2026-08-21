import { afterEach, describe, expect, test } from "bun:test";
import {
	restoreStderr,
	saveStderr,
	setupVT,
	stripAnsi,
} from "./test-helpers.ts";

const saved = saveStderr();

describe("RichRenderer token usage", () => {
	afterEach(() => restoreStderr(saved));

	test("在当前轮结束时展示 token、缓存命中和缓存写入", async () => {
		const vt = setupVT(100);
		const { RichRenderer } = await import("../rich-renderer.ts");
		const renderer = new RichRenderer();

		renderer.roundStart(1, 10, 3);
		renderer.roundEnd({
			inputTokens: 50,
			outputTokens: 20,
			totalTokens: 120,
			cacheReadTokens: 40,
			cacheWriteTokens: 10,
		});

		const output = vt
			.getVisibleLines()
			.map((line) => stripAnsi(line))
			.join("\n");
		expect(output).toContain("usage · 120 tok");
		expect(output).toContain("⚡40 hit 40%");
		expect(output).toContain("✎10 write");
	});
});
