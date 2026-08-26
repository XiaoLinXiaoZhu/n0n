/**
 * Show 结果格式化 — 将已验证的 CodeShowResult 渲染为 Markdown 文档
 */

import type { CodeShowResult } from "./schema.ts";

export function formatShowResult(result: CodeShowResult): string {
	switch (result.type) {
		case "production record":
			return `# ⏳ 生产记录\n\n${result.content}\n`;
		case "customer information required":
			return `# ❓ 需要客户信息\n\n${result.content}\n`;
		case "customer decision required":
			return `# ❓ 需要客户决定\n\n${result.content}\n`;
		case "customer action required":
			return `# 🆘 需要客户操作\n\n${result.content}\n`;
		case "qualified delivery":
			return `# ✅ 合格交付\n\n${result.content}\n`;
		case "production suspended":
			return `# ⏸️ 生产暂停\n\n${result.content}\n`;
		case "production failed":
			return `# ❌ 生产失败\n\n${result.content}\n`;
		case "customer cancelled":
			return `# ⏹️ 客户取消\n\n${result.content}\n`;
	}
}
