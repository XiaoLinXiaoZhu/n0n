# Code Agent — System Prompt & Fewshot Preview
> Captured via mock client through real agentLoop. Skill source: installed runtime.
> Regenerate from repository source: `bun run apps/code/scripts/preview-prompt.ts --repository-skills`

## Tool Definitions (1 tools)

- **post**(uri, body): Three uri schemes route this tool to different backends:  exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_toke...

## Message Sequence (3 messages, ~91 tokens)

| # | Role | Approx Tokens | Chars |
|---|------|--------------|-------|
| 1 | system | ~28 | 113 |
| 2 | user | ~44 | 175 |
| 3 | user | ~19 | 77 |

## Token Budget Breakdown

| Component | Approx Tokens | Chars |
|-----------|--------------|-------|
| System prompt | ~28 | 113 |
| Init skills (user message) | ~44 | 175 |
| Tool definitions | ~540 | 2,158 (1 tools) |
| Environment context | ~0 | 0 |
| User input | ~12 | 46 |
| **Total prefix (messages + tools)** | **~631** | **2,523** |

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

```
<user-request>
项目里的 auth 模块最近频繁报 token 过期，帮我排查一下原因，如果能修就顺手修了。
</user-request>
```
