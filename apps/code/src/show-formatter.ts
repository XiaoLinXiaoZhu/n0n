/**
 * Show 结果格式化 — 将已验证的 CodeShowResult 渲染为 Markdown 文档
 */

import type { CodeShowResult } from "./schema.ts";

export function formatShowResult(result: CodeShowResult): string {
	switch (result.type) {
		case "final report":
			return `# ✅ 任务完成\n\n${result.content}\n`;
		case "working log":
			return `# ⏳ 进行中\n\n${result.content}\n`;
		case "ask user question":
			return `# ❓ 需要确认\n\n${result.content}\n`;
		case "request user assistance":
			return `# 🆘 需要协助\n\n${result.content}\n`;
	}
}
