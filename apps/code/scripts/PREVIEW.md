# Code Agent — System Prompt & Fewshot Preview
> Captured via mock client through real agentLoop. Skill source: repository data/skills.
> Regenerate from repository source: `bun run apps/code/scripts/preview-prompt.ts --repository-skills`

## Tool Definitions (1 tools)

- **post**(uri, body): Four uri schemes route this tool to different backends:  exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_token...

## Message Sequence (3 messages, ~747 tokens)

| # | Role | Approx Tokens | Chars |
|---|------|--------------|-------|
| 1 | system | ~28 | 113 |
| 2 | user | ~44 | 175 |
| 3 | user | ~675 | 2,698 |

## Token Budget Breakdown

| Component | Approx Tokens | Chars |
|-----------|--------------|-------|
| System prompt | ~28 | 113 |
| Init skills (user message) | ~44 | 175 |
| Tool definitions | ~827 | 3,309 (1 tools) |
| Environment context | ~650 | 2,598 |
| User input | ~12 | 46 |
| **Total prefix (messages + tools)** | **~1,574** | **6,295** |

## Init Skills

| Order | Name |
|-------|------|
| 900 | git-proxy |

---

## [1/3] system

```
You are a agent operating in a local development environment. Your tools are provided by a runtime called `n0n`.

```

## [2/3] user

```
<skill name="git-proxy">
<!-- begin of skill git-proxy -->

遇到网络问题时尝试代理端口 7897：`set https_proxy=http://127.0.0.1:7897&& `（`&&` 前无空格）。

<!-- end of skill git-proxy -->
</skill>
```

## [3/3] user

~~~~
<context>
执行 n0n scan global 的结果为：
```
[OS]
Microsoft Windows [Version 10.0.26340.9767]

[Exec Runtimes] (use as `runtime` param in exec tool)
cmd: 10.0.26340.9767 (preferred)  →  cmd /c <tmpfile.cmd>
pwsh: 7.6.9  →  pwsh -NoProfile -File <tmpfile.ps1>
bun: 1.4.4 (preferred)  →  bun run <tmpfile.ts>
node: 24.22.1  →  node <tmpfile.mjs>
python3: 3.13.7 (preferred)  →  python3 <tmpfile.py>
uv: 0.8.14  →  uv run <tmpfile.py>
(default runtime: cmd)
To run inline code (TS/Python/PowerShell), use the runtime param directly — do NOT invoke interpreters through the default shell (e.g. don't write script="bun -e '...'" or script="python -c '...'"). Instead: exec(runtime="bun", script="<your TS code>") or exec(runtime="uv", script="<your Python code>").

[PATH Tools]
adb, bun, cargo, cmake, curl, dotnet, fastboot, ffmpeg, ffplay, ffprobe, gh, git, go, jq, markitdown, n0n, node, npm, nvim, pandoc, pnpm, ppt2md, pwsh, python, python3, rg, rustc, sqlite3, ssh, tar, tig, uv
(not exhaustive — use `n0n scan global --detail` for blacklist-filtered full list)
```

执行 n0n scan project 的结果为：
```
[Workspace]
E:\_Project\n0n

[Git]
Branch: refactor/post-scheme-registry
Status: 19 changed files
  M AGENTS.md
   M README.md
   M apps/n0n-scan/src/commands/project.ts
  D  biome.json
   M package.json
   M packages/cli-ui/src/__tests__/test-helpers.ts
   M packages/cli-ui/src/__tests__/virtual-terminal.ts
   M packages/cli-ui/src/ansi.ts
  ... and 11 more

[AGENTS.md]
## report 格式

如果用户提供日志文件。则应该先读取：

[log](packages/shared/src/conversation-log/types.ts)
[text-message](packages/types/src/domain.ts)

这两个文件以了解日志格式。然后使用jq按需提取日志文件中的信息。

## 工具链

全部内置于 Bun 1.4.4，不要引入 biome / prettier / eslint / tsc / turbo 等外部工具。

- 类型检查：`bun check`
- 运行测试：`bun test`
- 格式化与 import 排序：`bun fmt`（配置在 `bunfig.toml` 的 `[fmt]` 段）
- Lint：`bun lint`；批量修复用 `bun lint --fix`
- 提交前全量校验：`bun run ci`（`bun fmt --check` + `bun lint` + `bun check`）
- 依赖管理：`bun add` / `bun remove`

注意两点：

1. `bun fmt` / `bun lint` / `bun check` 会优先执行 package.json 中的**同名 script**，所以本仓库不定义这三个名字的 script；需要绕过时加 `--no-script`。
2. markdown 不在格式化范围内（`bunfig.toml` 的 `ignorePatterns` 已排除 `**/*.md`），不要用 `bun fmt` 去改 md。

[Codebase]
Structure: apps, data, docs, packages, scripts
Source files: 228
Total lines: ~27800
Type: node/bun, monorepo
```

执行 n0n skill 的结果为：
```
可用 Skills：

  cnki-parse-results — Parse current CNKI search results page into structured paper data (title, authors, journal, date, citations). Use after a search has been performed and you need to extract the results.

---
在响应用户请求前，检查是否有合适的 skill 可以加载。使用 `n0n skill read <name>` 获取完整方法论。
```
</context>

<user-request>
项目里的 auth 模块最近频繁报 token 过期，帮我排查一下原因，如果能修就顺手修了。
</user-request>
~~~~
