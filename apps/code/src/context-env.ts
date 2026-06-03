/**
 * context-env — 环境信息收集与格式化
 *
 * 执行 n0n-init / n0n-skill CLI 工具，将输出格式化为
 * UserInputMessage.context 字段的内容。
 *
 * 设计决策：使用 CLI 调用而非编程 API，使各模块可独立更新。
 * CLI 不可用时静默跳过，不影响 agent 启动。
 */

import { execSync } from "node:child_process";

function execCli(command: string, cwd: string): string | null {
	try {
		return execSync(command, {
			encoding: "utf8",
			timeout: 15_000,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return null;
	}
}

function formatSection(label: string, output: string | null): string {
	if (output === null) return "";
	return `执行 ${label} 的结果为：\n\`\`\`\n${output}\n\`\`\``;
}

/**
 * 收集环境信息并格式化为 context 字符串。
 *
 * @param workspace 工作目录路径
 * @returns 格式化后的环境信息；CLI 不可用时返回空字符串
 */
export function buildEnvironmentContext(workspace: string): string {
	const sections = [
		formatSection("n0n-init global", execCli("n0n-init global", workspace)),
		formatSection("n0n-init project", execCli("n0n-init project", workspace)),
		formatSection("n0n-skill", execCli("n0n-skill", workspace)),
	];

	return sections.filter(Boolean).join("\n\n");
}
