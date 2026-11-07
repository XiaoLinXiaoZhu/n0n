/**
 * global 命令：发现全局环境状态
 *
 * 输出：OS、exec 可用 runtime（分组 + 优先级推荐 + 版本）、PATH 中的 CLI 工具
 * --detail：使用黑名单过滤，展示更完整的工具列表
 */

import { readdirSync } from "node:fs";

import { resolvePlatform, runCommand, type RunCommandFn } from "@n0n/shared";

import { loadPathToolsConfig, type PathToolsConfig } from "../config/load.ts";

const IS_WINDOWS = process.platform === "win32";
const EXE_EXTENSIONS = IS_WINDOWS
  ? new Set(["exe", "cmd", "bat", "ps1"])
  : null;

export async function globalCommand(detail = false): Promise<void> {
  const sections: string[] = [];

  sections.push(await osSection(runCommand));
  sections.push(await runtimesSection(runCommand));
  sections.push(pathToolsSection(detail));

  console.log(sections.join("\n\n"));
}

// ── OS ──

async function osSection(runCommandFn: RunCommandFn): Promise<string> {
  const lines = ["[OS]"];
  if (IS_WINDOWS) {
    try {
      const { stdout } = await runCommandFn(["cmd", "/c", "ver"], {
        timeoutMs: 5000,
      });
      lines.push(stdout.trim());
    } catch {
      lines.push(`Platform: ${process.platform} ${process.arch}`);
    }
  } else {
    try {
      const { stdout } = await runCommandFn(["uname", "-srm"], {
        timeoutMs: 5000,
      });
      lines.push(stdout.trim());
    } catch {
      lines.push(`Platform: ${process.platform} ${process.arch}`);
    }
    const shell = process.env.SHELL || "unknown";
    lines.push(`Shell: ${shell}`);
  }
  return lines.join("\n");
}

// ── Runtimes ──

export type RuntimeGroup = "shell" | "js" | "python";

export interface RuntimeDef {
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

export interface ProbeResult {
  def: RuntimeDef;
  available: boolean;
  version: string | null;
}

export async function probeRuntimes(
  runCommandFn: RunCommandFn = runCommand,
): Promise<ProbeResult[]> {
  return Promise.all(
    RUNTIME_DEFS.map((def) => probeRuntime(def, runCommandFn)),
  );
}

async function probeRuntime(
  def: RuntimeDef,
  runCommandFn: RunCommandFn,
): Promise<ProbeResult> {
  const base: ProbeResult = { def, available: false, version: null };

  if (def.platforms && !def.platforms.includes(resolvePlatform())) {
    return base;
  }

  try {
    const { stdout } = await runCommandFn([def.cmd, ...def.args], {
      timeoutMs: 5000,
    });
    const output = stdout.trim();

    const match = output.match(def.versionPattern);
    const version = match?.[1] ?? null;

    if (!version && !def.versionOptional) return base;

    return { def, available: true, version };
  } catch {
    return base;
  }
}

/** 展示顺序 = 推荐顺序：跨平台一致性好的脚本 runtime 在前，shell 在后 */
const RUNTIME_GROUPS: RuntimeGroup[] = ["js", "python", "shell"];

function groupRuntimes(
  available: ProbeResult[],
  group: RuntimeGroup,
): ProbeResult[] {
  return available
    .filter((r) => r.def.group === group)
    .sort((a, b) => a.def.priority - b.def.priority);
}

async function runtimesSection(runCommandFn: RunCommandFn): Promise<string> {
  const lines = [
    "[Exec Runtimes] (`runtime` segment of exec://<runtime>/<NAME> is required — there is no default)",
  ];

  const available = (await probeRuntimes(runCommandFn)).filter(
    (r) => r.available,
  );

  // 每组首个标 (preferred)；跨组推荐取排序后的第一个（脚本 runtime 优先）
  const preferredPerGroup = RUNTIME_GROUPS.map((group) =>
    groupRuntimes(available, group),
  );
  const recommended = preferredPerGroup.find((list) => list.length > 0)?.[0];

  for (const groupResults of preferredPerGroup) {
    for (const [index, r] of groupResults.entries()) {
      const versionStr = r.version ?? "available";
      const marker = index === 0 ? " (preferred)" : "";
      lines.push(
        `${r.def.name}: ${versionStr}${marker}  →  ${r.def.execution}`,
      );
    }
  }

  if (recommended !== undefined) {
    lines.push(`(recommended runtime: ${recommended.def.name})`);
  }

  lines.push(
    `Prefer script runtimes over shells — the same script runs on every platform, while shell syntax and quoting differ. To run inline code (TS/Python/PowerShell), use the runtime segment directly: do NOT invoke an interpreter through a shell runtime (e.g. don't write script="bun -e '...'" or script="python -c '...'"). Instead: exec://bun/... with body = your TS code, or exec://uv/... with body = your Python code.`,
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

  lines.push(
    "(not exhaustive — use `n0n scan global --detail` for blacklist-filtered full list)",
  );

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
    const extensionIndex = entry.lastIndexOf(".");
    if (extensionIndex <= 0) return null;
    const ext = entry.slice(extensionIndex + 1).toLowerCase();
    if (!EXE_EXTENSIONS?.has(ext)) return null;
    return entry.slice(0, extensionIndex).toLowerCase();
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
