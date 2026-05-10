/**
 * project 命令：发现当前项目上下文
 *
 * 输出：git 状态、AGENTS.md、代码结构概览
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const IS_WINDOWS = process.platform === "win32";

export async function projectCommand(): Promise<void> {
	const cwd = process.cwd();
	const sections: string[] = [];

	sections.push(`[Workspace]\n${cwd}`);
	sections.push(gitSection());
	sections.push(agentsMdSection(cwd));
	sections.push(await codebaseSection(cwd));

	console.log(sections.join("\n\n"));
}

function gitSection(): string {
	const lines = ["[Git]"];
	try {
		const branch = execSync("git branch --show-current", { encoding: "utf8", timeout: 5000 }).trim();
		lines.push(`Branch: ${branch || "(detached HEAD)"}`);

		const status = execSync("git status --short", { encoding: "utf8", timeout: 5000 }).trim();
		if (status) {
			const changed = status.split("\n").length;
			lines.push(`Status: ${changed} changed file${changed > 1 ? "s" : ""}`);
			// Show first few changes
			const preview = status.split("\n").slice(0, 8);
			for (const line of preview) {
				lines.push(`  ${line}`);
			}
			if (changed > 8) lines.push(`  ... and ${changed - 8} more`);
		} else {
			lines.push("Status: clean");
		}
	} catch {
		lines.push("(not a git repository)");
	}
	return lines.join("\n");
}

function agentsMdSection(cwd: string): string {
	const lines = ["[AGENTS.md]"];
	const agentsPath = join(cwd, "AGENTS.md");
	if (existsSync(agentsPath)) {
		const content = readFileSync(agentsPath, "utf8").trim();
		if (content.length > 2000) {
			lines.push(content.slice(0, 2000));
			lines.push(`... (truncated, ${content.length} chars total)`);
		} else {
			lines.push(content);
		}
	} else {
		lines.push("(not found)");
	}
	return lines.join("\n");
}

async function codebaseSection(cwd: string): Promise<string> {
	const lines = ["[Codebase]"];
	const IGNORE = new Set([
		"node_modules", ".git", ".temp", "dist", ".turbo",
		"bun.lock", "bun.lockb", ".next", ".nuxt", "coverage",
		"__pycache__", ".venv", "venv", "target",
	]);

	let fileCount = 0;
	let lineCount = 0;
	const topDirs: string[] = [];

	// Scan top-level directories
	try {
		const entries = await readdir(cwd, { withFileTypes: true });
		for (const e of entries) {
			if (IGNORE.has(e.name)) continue;
			if (e.name.startsWith(".")) continue;
			if (e.isDirectory()) topDirs.push(e.name);
		}
	} catch {
		lines.push("(cannot read directory)");
		return lines.join("\n");
	}

	// Walk and count source files
	const SOURCE_EXTS = /\.(ts|js|tsx|jsx|py|rs|go|java|c|cpp|h|hpp|cs|rb|swift|kt)$/;
	async function walk(dir: string, depth: number): Promise<void> {
		if (depth > 6) return;
		try {
			const entries = await readdir(dir, { withFileTypes: true });
			for (const e of entries) {
				if (IGNORE.has(e.name)) continue;
				if (e.name.startsWith(".")) continue;
				const full = join(dir, e.name);
				if (e.isDirectory()) {
					await walk(full, depth + 1);
				} else if (SOURCE_EXTS.test(e.name)) {
					fileCount++;
					try {
						const content = readFileSync(full, "utf8");
						lineCount += content.split("\n").length;
					} catch {
						// skip unreadable
					}
				}
			}
		} catch {
			// skip unreadable
		}
	}

	await walk(cwd, 0);

	if (topDirs.length > 0) {
		lines.push(`Structure: ${topDirs.join(", ")}`);
	}
	lines.push(`Source files: ${fileCount}`);
	lines.push(`Total lines: ~${Math.round(lineCount / 100) * 100}`);

	// Detect project type
	const markers: string[] = [];
	if (existsSync(join(cwd, "package.json"))) markers.push("node/bun");
	if (existsSync(join(cwd, "Cargo.toml"))) markers.push("rust");
	if (existsSync(join(cwd, "go.mod"))) markers.push("go");
	if (existsSync(join(cwd, "pyproject.toml")) || existsSync(join(cwd, "requirements.txt"))) markers.push("python");
	if (existsSync(join(cwd, "turbo.json")) || existsSync(join(cwd, "pnpm-workspace.yaml"))) markers.push("monorepo");
	if (existsSync(join(cwd, ".venv"))) markers.push(".venv present");
	if (markers.length > 0) lines.push(`Type: ${markers.join(", ")}`);

	return lines.join("\n");
}
