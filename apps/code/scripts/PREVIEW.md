# Code Agent — System Prompt & Fewshot Preview
> Captured via mock client through real agentLoop. Skill source: installed runtime.
> Regenerate from repository source: `bun run apps/code/scripts/preview-prompt.ts --repository-skills`

## Tool Definitions (1 tools)

- **post**(uri, body): Four uri schemes route this tool to different backends:  exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_token...

## Message Sequence (3 messages, ~632 tokens)

| # | Role | Approx Tokens | Chars |
|---|------|--------------|-------|
| 1 | system | ~28 | 113 |
| 2 | user | ~44 | 175 |
| 3 | user | ~560 | 2,239 |

## Token Budget Breakdown

| Component | Approx Tokens | Chars |
|-----------|--------------|-------|
| System prompt | ~28 | 113 |
| Init skills (user message) | ~44 | 175 |
| Tool definitions | ~827 | 3,308 (1 tools) |
| Environment context | ~535 | 2,139 |
| User input | ~12 | 46 |
| **Total prefix (messages + tools)** | **~1,459** | **5,835** |

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
Darwin 27.0.0 arm64
Shell: /bin/zsh

[Exec Runtimes] (use as `runtime` param in exec tool)
sh: available (preferred)  →  sh <tmpfile.sh>
bash: 3.2.57  →  bash <tmpfile.sh>
bun: 1.4.4 (preferred)  →  bun run <tmpfile.ts>
node: 26.7.0  →  node <tmpfile.mjs>
python3: 3.9.6 (preferred)  →  python3 <tmpfile.py>
uv: 0.12.24  →  uv run <tmpfile.py>
(default runtime: sh)
To run inline code (TS/Python/PowerShell), use the runtime param directly — do NOT invoke interpreters through the default shell (e.g. don't write script="bun -e '...'" or script="python -c '...'"). Instead: exec(runtime="bun", script="<your TS code>") or exec(runtime="uv", script="<your Python code>").

[PATH Tools]
bun, cargo, curl, docker, ffmpeg, ffplay, ffprobe, gcc, gh, git, jq, kubectl, make, n0n, node, npm, openssl, python3, rg, rsync, rustc, sqlite3, ssh, tar, unzip, uv, zip, zstd
(not exhaustive — use `n0n scan global --detail` for blacklist-filtered full list)
```

执行 n0n scan project 的结果为：
```
[Workspace]
/Users/xlxz/projects/n0n

[Git]
Branch: refactor/post-scheme-registry
Status: 35 changed files
  M apps/code/scripts/PREVIEW.md
   M apps/code/scripts/build-request.ts
   M apps/code/scripts/preview-prompt.ts
   M apps/code/src/code-renderer.ts
   M packages/shared/scripts/generate-format-snapshots.ts
   M packages/shared/scripts/preview-output-deepseek/assistant-tool-call.snapshot.md
   M packages/shared/scripts/preview-output-deepseek/exec-completed-error.snapshot.md
   M packages/shared/scripts/preview-output-deepseek/exec-completed.snapshot.md
  ... and 27 more

[AGENTS.md]
## report 格式

如果用户提供日志文件。则应该先读取：

[log](packages/shared/src/conversation-log/types.ts)
[text-message](packages/types/src/domain.ts)

这两个文件以了解日志格式。然后使用jq按需提取日志文件中的信息。

## 工具链

- 类型检查：`bun run tsgo --noEmit`（TypeScript 7.0 Beta）
- 运行测试：`bun test`
- 代码格式化/Lint：`bun run biome check --fix`
- 依赖管理：`bun add` / `bun remove`

[Codebase]
Structure: docs, scripts, packages, data, apps
Source files: 234
Total lines: ~27700
Type: node/bun, monorepo
```

执行 n0n skill 的结果为：
```
没有 auto 激活的 skill。运行 `n0n skill list --all` 查看所有可用 skill。
```
</context>

<user-request>
项目里的 auth 模块最近频繁报 token 过期，帮我排查一下原因，如果能修就顺手修了。
</user-request>
~~~~
