/**
 * deepseek-test-1 触发 prompt 加载器
 *
 * 从同目录 trigger-prompt.md 读取触发文本，剥离 HTML 注释块后返回正文。
 * 该文本作为 client 注入的第一个 user 消息前缀（拼在 skill 之前）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

let cached: string | null = null;

/** 读取并缓存触发 prompt（剥离 HTML 注释后的正文） */
export function loadTriggerPrompt(): string {
	if (cached !== null) return cached;
	const path = join(import.meta.dir, "trigger-prompt.md");
	const raw = readFileSync(path, "utf-8");
	cached = raw.replace(/<!--[\s\S]*?-->/g, "").trim();
	return cached;
}
