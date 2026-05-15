---
alias: project-init
description: 引导式项目初始化配置。搭建 monorepo 结构、issue tracker、lint 配置等。当用户要开新项目或为现有项目配置基础设施时使用。
activation: manual
---

# Project Init

引导式的项目初始化配置。把复杂的一次性配置分解为一系列简单选择。

## 交互模式

每项配置遵循"解释 → 选择 → 确认"的小循环：

1. 简短解释这项配置是什么、为什么需要、选不同有什么影响
2. 呈现选项，用 `progress(blocked)` 等待用户选择
3. 用户确认后立即写入，然后进入下一项

一次只呈现一项配置，不一次性抛出所有选项。

## 配置项

### A. 项目结构

> monorepo 下的代码组织方式。apps/ 放独立可运行的应用，packages/ 放可复用的库。

默认：bun workspace monorepo

```
project-root/
├── apps/
│   └── xxx/
├── packages/
│   └── xxx/
├── package.json          # workspace root
└── tsconfig.json
```

询问用户：
- 项目名称
- 需要哪些 apps 和 packages

### B. Issue Tracker

> skill（to-issues、to-prd 等）需要知道 issue 在哪里管理。

选项：
- **GitHub Issues**——使用 `gh` CLI
- **本地 Markdown**——文件存在 `.scratch/` 下
- **其他**——用户描述工作流

### C. 领域文档布局

> 某些 skill 会读取领域词汇表和架构决策记录。

选项：
- **单上下文**——一个 AGENTS.md + `docs/adr/`（大多数项目）
- **多上下文**——CONTEXT-MAP.md 指向多个上下文目录（monorepo 的独立子系统）

### D. 可选配置

根据用户需要逐项询问：
- Lint 配置（biome / eslint）
- CI 模板
- Git hooks

## 流程

### 1. 探索

observe 检查当前状态：`git remote`、现有配置文件、目录结构。

### 2. 逐项配置

按 A → B → C → D 顺序，每项一个 `progress(blocked)` 循环。

### 3. 写入

将所有配置写入文件。包括：
- `package.json`（workspace 配置）
- `tsconfig.json`
- `AGENTS.md`（项目说明 + 领域词汇表占位）
- `docs/agents/issue-tracker.md`（如选了 issue tracker）
- 其他用户选择的配置文件

### 4. 完成

**退出 → 提交 `progress(completed)`**，列出已创建的所有文件和配置概要。
