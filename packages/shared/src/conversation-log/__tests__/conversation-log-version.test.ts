import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConversation } from "../conversation-log.ts";

describe("conversation log version boundary", () => {
	test("version 1 is rejected before history enters the domain model", () => {
		const dir = mkdtempSync(join(tmpdir(), "n0n-log-"));
		const path = join(dir, "v1.json");
		writeFileSync(
			path,
			JSON.stringify({
				version: 1,
				humanReadable: {
					savedAt: "2026-01-01T00:00:00.000Z",
					workspace: "/tmp/work",
					messageCount: 2,
				},
				history: [
					{
						type: "tool_result",
						tool: "observe",
						status: "truncated",
						outputFile: ".temp/old-output.txt",
						truncatedChunks: [{ startLine: 1, endLine: 2, tokens: 10 }],
					},
					{
						type: "tool_result",
						tool: "observe",
						status: "backgrounded",
						logFile: ".temp/old-bg.log",
					},
				],
			}),
		);

		expect(() => loadConversation(path)).toThrow(
			"Unsupported conversation log version: 1 (expected 2)",
		);
	});
});
