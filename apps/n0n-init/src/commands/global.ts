/**
 * global 命令：发现全局环境状态
 *
 * 输出：OS、exec 可用 runtime（含执行方式说明）、PATH 中的 CLI 工具
 * --detail：使用黑名单过滤，展示更完整的工具列表
 */

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { loadPathToolsConfig, type PathToolsConfig } from "../config/load.ts";

const IS_WINDOWS = process.platform === "win32";
const EXE_EXTENSIONS = IS_WINDOWS ? new Set(["exe", "cmd", "bat", "ps1"]) : null;

export async function globalCommand(detail = false): Promise<void> {
	const sections: string[] = [];

	sections.push(osSection());
	sections.push(runtimesSection());
	sections.push(pathToolsSection(detail));

	console.log(sections.join("\n\n"));
}

function osSection(): string {
	const lines = ["[OS]"];
	if (IS_WINDOWS) {
		try {
			const ver = execSync("ver", { encoding: "utf8" }).trim();
			lines.push(ver);
		} catch {
			lines.push(`Platform: ${process.platform} ${process.arch}`);
		}
	} else {
		try {
			const uname = execSync("uname -srm", { encoding: "utf8" }).trim();
			lines.push(uname);
		} catch {
			lines.push(`Platform: ${process.platform} ${process.arch}`);
		}
		const shell = process.env.SHELL || "unknown";
		lines.push(`Shell: ${shell}`);
	}
	return lines.join("\n");
}

function runtimesSection(): string {
	const lines = ["[Exec Runtimes] (use as `runtime` param in exec tool)"];

	const checks: Array<{
		name: string;
		cmd: string;
		execution: string;
		windows?: boolean;
		unix?: boolean;
	}> = [
		{ name: "sh", cmd: "sh --version", execution: "sh <tmpfile.sh>", unix: true },
		{ name: "bash", cmd: "bash --version", execution: "bash <tmpfile.sh>", unix: true },
		{ name: "pwsh", cmd: "pwsh --version", execution: "pwsh -NoProfile -File <tmpfile.ps1>" },
		{ name: "cmd", cmd: "cmd /c echo available", execution: "cmd /c <tmpfile.cmd>", windows: true },
		{ name: "bun", cmd: "bun --version", execution: "bun run <tmpfile.ts>" },
		{ name: "node", cmd: "node --version", execution: "node <tmpfile.mjs>" },
		{ name: "deno", cmd: "deno --version", execution: "deno run --allow-all <tmpfile.ts>" },
		{ name: "python3", cmd: IS_WINDOWS ? "python --version" : "python3 --version", execution: "python3 <tmpfile.py>" },
		{ name: "uv", cmd: "uv --version", execution: "uv run <tmpfile.py>" },
	];

	for (const { name, cmd, execution, windows, unix } of checks) {
		if (windows && !IS_WINDOWS) continue;
		if (unix && IS_WINDOWS) continue;
		try {
			const ver = execSync(cmd, {
				encoding: "utf8",
				timeout: 5000,
				stdio: ["pipe", "pipe", "pipe"],
			}).trim().split("\n")[0]!;
			lines.push(`${name}: ${ver}  →  ${execution}`);
		} catch {
			// not available
		}
	}

	if (!IS_WINDOWS) {
		lines.push(`(default runtime: sh)`);
	} else {
		lines.push(`(default runtime: cmd)`);
	}

	lines.push(
		`To run inline code (TS/Python/PowerShell), use the runtime param directly — do NOT invoke interpreters through the default shell (e.g. don't write script="bun -e '...'" or script="python -c '...'"). Instead: exec(runtime="bun", script="<your TS code>") or exec(runtime="uv", script="<your Python code>").`,
	);

	return lines.join("\n");
}

function pathToolsSection(detail: boolean): string {
	const config = loadPathToolsConfig();

	if (detail) {
		return pathToolsDetailed(config);
	}
	return pathToolsWhitelist(config);
}

function pathToolsWhitelist(config: PathToolsConfig): string {
	const lines = ["[PATH Tools]"];
	const found: string[] = [];
	const dirs = (process.env.PATH || "").split(IS_WINDOWS ? ";" : ":");
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!dir || seen.has(dir.toLowerCase())) continue;
		seen.add(dir.toLowerCase());
		try {
			for (const entry of readdirSync(dir)) {
				const name = normalizeName(entry);
				if (name && config.whitelist.has(name) && !found.includes(name)) {
					found.push(name);
				}
			}
		} catch {
			// unreadable dir
		}
	}

	if (found.length > 0) {
		lines.push(found.sort().join(", "));
	} else {
		lines.push("(none detected)");
	}

	lines.push("(not exhaustive — use `n0n-init global --detail` for blacklist-filtered full list)");

	return lines.join("\n");
}

function pathToolsDetailed(config: PathToolsConfig): string {
	const lines = ["[PATH Tools (detailed, blacklist-filtered)]"];
	const found = new Set<string>();
	const dirs = (process.env.PATH || "").split(IS_WINDOWS ? ";" : ":");
	const seen = new Set<string>();

	for (const dir of dirs) {
		if (!dir || seen.has(dir.toLowerCase())) continue;
		seen.add(dir.toLowerCase());

		if (isDirBlacklisted(dir, config)) continue;

		try {
			for (const entry of readdirSync(dir)) {
				const name = normalizeName(entry);
				if (!name) continue;
				if (isNameBlacklisted(name, config)) continue;
				found.add(name);
			}
		} catch {
			// unreadable dir
		}
	}

	const sorted = [...found].sort();
	if (sorted.length > 0) {
		lines.push(sorted.join(", "));
	} else {
		lines.push("(none detected)");
	}

	return lines.join("\n");
}

function normalizeName(entry: string): string | null {
	if (IS_WINDOWS) {
		const parts = entry.split(".");
		if (parts.length > 1) {
			const ext = parts.pop()!.toLowerCase();
			if (!EXE_EXTENSIONS!.has(ext)) return null;
			return parts.join(".").toLowerCase();
		}
		return null;
	}
	// Unix: any file in PATH is potentially executable
	return entry.toLowerCase();
}

function isDirBlacklisted(dir: string, config: PathToolsConfig): boolean {
	for (const pattern of config.blacklistDirPatterns) {
		if (pattern.test(dir)) return true;
	}
	return false;
}

function isNameBlacklisted(name: string, config: PathToolsConfig): boolean {
	if (config.blacklistNameExact.has(name)) return true;

	for (const prefix of config.blacklistNamePrefixes) {
		if (name.startsWith(prefix)) return true;
	}

	for (const pattern of config.blacklistNamePatterns) {
		if (pattern.test(name)) return true;
	}

	return false;
}
