/**
 * help 命令：展示 n0n-init 用法
 */

export function helpCommand(): void {
	console.log(`n0n-init — Environment Discovery Tool

Usage:
  n0n-init global    Discover global environment (OS, runtimes, PATH tools)
  n0n-init project   Discover project context (git, structure, AGENTS.md)

Both commands are read-only and stateless.`);
}
