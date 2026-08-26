---
alias: project-init
description: 引导式项目初始化配置。搭建 monorepo 结构、issue tracker、lint 配置等。当用户要开新项目或为现有项目配置基础设施时使用。
activation: manual
---

# Project Init

引导式的项目初始化配置。把复杂的一次性配置分解为一系列简单选择。

## 交互模式

每项配置先判断客户承担的是提供要求还是作出取舍：

1. 客户只需给出项目名称、应用/包清单或其他既有要求时，用 `show(customer information required)`；
2. 存在会改变产品范围、工作流或长期契约的真实选项时，解释后果并用 `show(customer decision required)`；
3. 生产方能够依据项目现状和常规工程责任决定的技术细节，不转交客户；
4. 客户完成该项责任后立即写入，然后进入下一项。

一条等待消息只包含一种客户责任；存在依赖时按依赖顺序请求。

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

按 A → B → C → D 的依赖顺序配置。A 中的项目名称和 apps/packages 清单属于客户信息；
B、C、D 只有存在真实客户取舍时才使用客户决定请求。

### 3. 写入

将所有配置写入文件。包括：
- `package.json`（workspace 配置）
- `tsconfig.json`
- `AGENTS.md`（项目说明 + 领域词汇表占位）
- `docs/agents/issue-tracker.md`（如选了 issue tracker）
- 其他用户选择的配置文件

### 4. 完成

**退出 → 提交 `show(qualified delivery)`**，列出已创建的所有文件和配置概要。
