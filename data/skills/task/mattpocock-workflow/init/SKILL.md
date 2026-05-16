---
description: 初始化仓库配置：建立 issue tracker、领域词汇表、triage 标签、架构决策记录等基础设施。当用户说"初始化"、"配置仓库"、"设置项目"或由 @mwf 自动路由到 init 阶段时使用。
activation: manual
alias: mwf-init
---

# Init（仓库初始化）

引导式配置，为当前仓库建立工程规范基础设施。一次完成后极少需要再次运行。

参考 `_shared.md` 了解公共概念。

## 前置条件

当前工作目录是一个 Git 仓库。

## 流程

### 1. 探索现状

用 `observe` 了解仓库的当前状态。读取但不假设存在：

- `git remote -v` 和 `.git/config` — 是 GitHub 仓库吗？远程地址是什么？
- `AGENTS.md` — 是否存在？是否有 `## Agent skills` 段？
- `CONTEXT.md` 和 `CONTEXT-MAP.md` — 是否存在？
- `docs/adr/` — 是否存在？有哪些目录？
- `docs/agents/` — 是否存在？

### 2. 分项配置

用 `progress(blocked)` 逐项引导用户配置，**一次一项**。每项先解释（这是什么、为什么需要），再展示选项和默认值，等用户确认后再进入下一项。

#### A — Issue tracker

> issue tracker 是本仓库 issue（任务单元）的存放位置。`dispatch` 等用于输出 issue 的 skill 需要知道调用什么工具、按什么约定操作。

基于 `git remote -v` 推断默认值。选项：
- **GitHub** — issue 作为 GitHub Issues 管理，使用 `gh` CLI。
  写入 `docs/agents/issue-tracker.md`，参考 [issue-tracker-github.md](references/issue-tracker-github.md)。
- **GitLab** — issue 作为 GitLab Issues 管理，使用 `glab` CLI。
  写入 `docs/agents/issue-tracker.md`，参考 [issue-tracker-gitlab.md](references/issue-tracker-gitlab.md)。
- **本地 markdown** — issue 作为 `.scratch/<feature>/` 下的 markdown 文件。
  写入 `docs/agents/issue-tracker.md`，参考 [issue-tracker-local.md](references/issue-tracker-local.md)。

#### B — 领域词汇表

> 领域词汇表（`CONTEXT.md`）定义项目使用的精确术语。`plan` 和 `resolve-hitl` 在质询过程中会维护它。其他 skill 探索代码库时也从中获取术语。

确认布局：
- **单上下文** — 一个 `CONTEXT.md` + `docs/adr/` 在仓库根目录。大多数仓库是这个。
- **多上下文** — `CONTEXT-MAP.md` 指向每个子域的 `CONTEXT.md`（通常是 monorepo）。

默认：单上下文。如果不存在 `CONTEXT.md`，plan 阶段会按需创建。

写入 `docs/agents/domain.md`，参考 [domain.md](references/domain.md)。

#### C — 架构决策记录（ADR）

> ADR 记录难以逆转的架构取舍。`plan` 和 `resolve-hitl` 在质询过程中检查三个条件后按需创建。

默认位置：`docs/adr/`。确认用户是否接受，或指定其他路径。

#### D — Triage 标签

> 当 `dispatch` 处理 issue 时，它通过标签/状态来跟踪 issue 的生命周期。如果项目已有自己的标签体系，在此映射。

五个规范化角色（参考 [triage-labels.md](references/triage-labels.md)）：

| 角色 | 默认标签 | 含义 |
|------|---------|------|
| `needs-triage` | `needs-triage` | 需要维护者评估 |
| `needs-info` | `needs-info` | 等待报告人补充信息 |
| `ready-for-agent` | `ready-for-agent` | 已充分定义，AFK agent 可执行 |
| `ready-for-human` | `ready-for-human` | 需要人类实现 |
| `wontfix` | `wontfix` | 不做 |

询问用户是否有自定标签需要映射。默认直接使用角色名作为标签。

写入 `docs/agents/triage-labels.md`，参考 [triage-labels.md](references/triage-labels.md)。

### 3. 写入配置

所有四项确认后，用 `write`/`edit` 一次性写入：

**AGENTS.md** — 添加或更新 `## Agent skills` 段：

```markdown
## Agent skills

### Issue tracker

<摘要>。详见 `docs/agents/issue-tracker.md`。

### 领域词汇表

单上下文 / 多上下文。详见 `docs/agents/domain.md`。

### ADR

位置：`docs/adr/`。

### Triage labels

五个规范化角色。详见 `docs/agents/triage-labels.md`。
```

**docs/agents/issue-tracker.md** — 根据 A 的选择写入对应模板内容。

**docs/agents/domain.md** — 根据 B 的选择写入对应布局。

**docs/agents/triage-labels.md** — 根据 D 的映射写入。

### 4. 完成

**退出 → 提交 `progress(completed)`，格式：**

```
【阶段】Init — 完成
【Issue tracker】GitHub / GitLab / 本地 markdown
【领域词汇表】单上下文 / 多上下文
【ADR 位置】docs/adr/
【Triage 标签】默认 / 已映射
【AGENTS.md 更新】新增 ## Agent skills 段 / 已有段已更新
【下一步】可用 @mwf plan 开始讨论 idea
```
