#!/usr/bin/env bun
/**
 * n0n-init CLI — Environment Discovery Tool
 *
 * 无状态，只读环境信息并输出结构化文本。
 *
 * 命令：
 *   (无参数) — 展示帮助
 *   global   — 全局环境状态（OS、运行时、PATH 工具）
 *   project  — 项目上下文（git、AGENTS.md、代码结构）
 */

import { globalCommand } from "./commands/global.ts";
import { projectCommand } from "./commands/project.ts";
import { helpCommand } from "./commands/help.ts";

const args = process.argv.slice(2);
const command = args[0];

async function main() {
	switch (command) {
		case "global":
			await globalCommand(args.includes("--detail"));
			break;
		case "project":
			await projectCommand();
			break;
		case "help":
		case undefined:
			helpCommand();
			break;
		default:
			console.error(`未知命令: ${command}`);
			console.error("可用命令: global, project");
			process.exit(1);
	}
}

main().catch((err) => {
	console.error(err.message ?? err);
	process.exit(1);
});
