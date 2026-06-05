/**
 * ProgressWriter — Progress 结果持久化
 *
 * 管理 session 目录编号和 progress 文件的写入。
 * 每次 agent loop 完成后，将 progress 结果写入 session 目录。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { CodeProgressResult } from "./schema.ts";
import { formatProgressResult } from "./progress-formatter.ts";

export class ProgressWriter {
	private readonly tempDir: string;
	private readonly sessionDir: string;
	private seq = 0;

	constructor(tempDir: string) {
		this.tempDir = tempDir;
		this.sessionDir = this.createSessionDir(tempDir);
	}

	/** 自动递增的 session 目录编号 */
	private createSessionDir(tempDir: string): string {
		const nextId = (() => {
			try {
				const existing = readdirSync(tempDir)
					.filter((d) => d.startsWith("session-"))
					.map((d) => Number.parseInt(d.slice("session-".length), 10))
					.filter((n) => !Number.isNaN(n));
				return existing.length > 0 ? Math.max(...existing) + 1 : 1;
			} catch {
				return 1;
			}
		})();
		return resolve(tempDir, `session-${String(nextId).padStart(4, "0")}`);
	}

	/** 写入一条 progress 结果到 session 目录 */
	write(result: CodeProgressResult): void {
		this.seq++;
		const filename = `${String(this.seq).padStart(4, "0")}-${result.status}.md`;
		const formatted = formatProgressResult(result);
		try {
			if (!existsSync(this.sessionDir)) {
				mkdirSync(this.sessionDir, { recursive: true });
			}
			writeFileSync(resolve(this.sessionDir, filename), formatted, "utf-8");
			writeFileSync(
				resolve(this.sessionDir, "current-progress.md"),
				formatted,
				"utf-8",
			);
		} catch {
			// 写入失败不阻断 REPL
		}
	}
}
