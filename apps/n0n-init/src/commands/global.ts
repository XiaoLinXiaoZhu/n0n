/**
 * global 命令：发现全局环境状态
 *
 * 输出：OS、exec 可用 runtime（分组 + 优先级推荐 + 版本）、PATH 中的 CLI 工具
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

// ── OS ──

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

// ── Runtimes ──

type RuntimeGroup = "shell" | "js" | "python";

interface RuntimeDef {
	name: string;
	group: RuntimeGroup;
	/** 版本探测命令 */
	cmd: string;
	args: string[];
	/** 从输出中提取版本号 */
	versionPattern: RegExp;
	/** exec 工具的执行方式说明 */
	execution: string;
	/** 同组优先级（越小越优先） */
	priority: number;
	/** 仅在指定平台探测 */
	platforms: ("win32" | "darwin" | "linux")[] | null;
	/** 版本解析失败时是否仍标记为可用（shell 类） */
	versionOptional?: boolean;
}

const RUNTIME_DEFS: RuntimeDef[] = [
	// Shell
	{
		name: "cmd",
		group: "shell",
		cmd: "cmd",
		args: ["/c", "ver"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		execution: "cmd /c <tmpfile.cmd>",
		priority: 1,
		platforms: ["win32"],
		versionOptional: true,
	},
	{
		name: "sh",
		group: "shell",
		cmd: "sh",
		args: ["-c", "exit 0"],
		versionPattern: /^$/,
		execution: "sh <tmpfile.sh>",
		priority: 1,
		platforms: ["darwin", "linux"],
		versionOptional: true,
	},
	{
		name: "bash",
		group: "shell",
		cmd: "bash",
		args: ["--version"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		execution: "bash <tmpfile.sh>",
		priority: 2,
		platforms: null,
	},
	{
		name: "pwsh",
		group: "shell",
		cmd: "pwsh",
		args: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		execution: "pwsh -NoProfile -File <tmpfile.ps1>",
		priority: 3,
		platforms: null,
	},
	// JS/TS — bun > node > deno
	{
		name: "bun",
		group: "js",
		cmd: "bun",
		args: ["--version"],
		versionPattern: /(\d+\.\d+[\w.]*)/,
		execution: "bun run <tmpfile.ts>",
		priority: 1,
		platforms: null,
	},
	{
		name: "node",
		group: "js",
		cmd: "node",
		args: ["--version"],
		versionPattern: /v?(\d+\.\d+[\w.]*)/,
		execution: "node <tmpfile.mjs>",
		priority: 2,
		platforms: null,
	},
	{
		name: "deno",
		group: "js",
		cmd: "deno",
		args: ["--version"],
		versionPattern: /deno\s+(\d+\.\d+[\w.]*)/,
		execution: "deno run --allow-all <tmpfile.ts>",
		priority: 3,
		platforms: null,
	},
	// Python — python3 > uv
	{
		name: "python3",
		group: "python",
		cmd: IS_WINDOWS ? "python" : "python3",
		args: ["--version"],
		versionPattern: /Python\s+(\d+\.\d+[\w.]*)/,
		execution: "python3 <tmpfile.py>",
		priority: 1,
		platforms: null,
	},
	{
		name: "uv",
		group: "python",
		cmd: "uv",
		args: ["--version"],
		versionPattern: /uv\s+(\d+\.\d+[\w.]*)/,
		execution: "uv run <tmpfile.py>",
		priority: 2,
		platforms: null,
	},
];

interface ProbeResult {
	def: RuntimeDef;
	available: boolean;
	version: string | null;
}

function probeRuntime(def: RuntimeDef): ProbeResult {
	const base: ProbeResult = { def, available: false, version: null };

	if (def.platforms && !def.platforms.includes(process.platform as "win32" | "darwin" | "linux")) {
		return base;
	}

	try {
		const output = execSync(`${def.cmd} ${def.args.join(" ")}`, {
			encoding: "utf8",
			timeout: 5000,
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();

		const match = output.match(def.versionPattern);
		const version = match?.[1] ?? null;

		if (!version && !def.versionOptional) return base;

		return { def, available: true, version };
	} catch {
		return base;
	}
}

function runtimesSection(): string {
	const lines = ["[Exec Runtimes] (use as `runtime` param in exec tool)"];

	const results = RUNTIME_DEFS.map(probeRuntime);
	const available = results.filter((r) => r.available);

	// 按分组输出，每组标注首选
	const groups: RuntimeGroup[] = ["shell", "js", "python"];
	const preferredByGroup = new Map<RuntimeGroup, string>();

	for (const group of groups) {
		const groupResults = available
			.filter((r) => r.def.group === group)
			.sort((a, b) => a.def.priority - b.def.priority);

		if (groupResults.length > 0) {
			preferredByGroup.set(group, groupResults[0]!.def.name);
		}

		for (const r of groupResults) {
			const isPreferred = r.def.name === preferredByGroup.get(group);
			const versionStr = r.version ? `${r.version}` : "available";
			const marker = isPreferred ? " (preferred)" : "";
			lines.push(`${r.def.name}: ${versionStr}${marker}  →  ${r.def.execution}`);
		}
	}

	const defaultRuntime = IS_WINDOWS ? "cmd" : "sh";
	lines.push(`(default runtime: ${defaultRuntime})`);

	lines.push(
		`To run inline code (TS/Python/PowerShell), use the runtime param directly — do NOT invoke interpreters through the default shell (e.g. don't write script="bun -e '...'" or script="python -c '...'"). Instead: exec(runtime="bun", script="<your TS code>") or exec(runtime="uv", script="<your Python code>").`,
	);

	return lines.join("\n");
}

// ── PATH Tools ──

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

// ── Helpers ──

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
