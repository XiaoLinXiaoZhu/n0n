/**
 * context-env — 环境信息收集与格式化
 *
 * 执行统一 n0n CLI 的 scan / skill 子命令，将输出格式化为
 * UserInputMessage.context 字段的内容。
 *
 * 设计决策：使用 CLI 调用而非编程 API，使各模块可独立更新。
 * CLI 不可用时静默跳过，不影响 agent 启动。
 */

import { type RunCommandFn, runCommand } from "@n0n/shared";

export interface BuildEnvironmentContextOptions {
	/** 注入的 runCommand 实现；默认使用 @n0n/shared 的真实实现（测试用） */
	runCommandFn?: RunCommandFn;
}

async function execCli(
	args: readonly string[],
	cwd: string,
	runCommandFn: RunCommandFn,
): Promise<string | null> {
	try {
		const { stdout } = await runCommandFn(["n0n", ...args], {
			cwd,
			timeoutMs: 15_000,
		});
		return stdout.trim();
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
 * 三个 CLI 调用互相独立，并行执行。调用方应在真正需要 context 时
 * 才调用本函数，避免阻塞交互式 prompt 的显示。
 *
 * @param workspace 工作目录路径
 * @param options.runCommandFn 注入的 runCommand 实现（测试用）
 * @returns 格式化后的环境信息；CLI 不可用时返回空字符串
 */
export async function buildEnvironmentContext(
	workspace: string,
	options: BuildEnvironmentContextOptions = {},
): Promise<string> {
	const runCommandFn = options.runCommandFn ?? runCommand;
	const [globalOutput, projectOutput, skillOutput] = await Promise.all([
		execCli(["scan", "global"], workspace, runCommandFn),
		execCli(["scan", "project"], workspace, runCommandFn),
		execCli(["skill"], workspace, runCommandFn),
	]);

	const sections = [
		formatSection("n0n scan global", globalOutput),
		formatSection("n0n scan project", projectOutput),
		formatSection("n0n skill", skillOutput),
	];

	return sections.filter(Boolean).join("\n\n");
}
