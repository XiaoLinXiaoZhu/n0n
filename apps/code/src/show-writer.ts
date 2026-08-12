/**
 * ShowWriter — Show 结果持久化
 *
 * 管理 session 目录编号和 show 结果文件的写入。
 * 每次 agent loop 完成后，将 show 结果写入 session 目录。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CodeShowResult } from "./schema.ts";
import { formatShowResult } from "./show-formatter.ts";

export class ShowWriter {
	private readonly sessionDir: string;
	private seq = 0;

	constructor(sessionDir: string) {
		this.sessionDir = sessionDir;
	}

	/** 写入一条 show 结果到 session 目录 */
	write(result: CodeShowResult): void {
		this.seq++;
		// 将 type 中的空格替换为连字符用于文件名
		const typeSlug = result.type.replace(/\s+/g, "-");
		const filename = `${String(this.seq).padStart(4, "0")}-${typeSlug}.md`;
		const formatted = formatShowResult(result);
		try {
			if (!existsSync(this.sessionDir)) {
				mkdirSync(this.sessionDir, { recursive: true });
			}
			writeFileSync(resolve(this.sessionDir, filename), formatted, "utf-8");
			writeFileSync(
				resolve(this.sessionDir, "current-show.md"),
				formatted,
				"utf-8",
			);
		} catch {
			// 写入失败不阻断 REPL
		}
	}
}
