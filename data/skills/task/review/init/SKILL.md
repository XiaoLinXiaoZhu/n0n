---
description: 代码审查的准备阶段。收集 diff、识别 spec 来源和 standards 来源。通常作为 review-spec 和 review-standards 的前置步骤。当用户要求 review 时自动执行。
activation: manual
---

# Review Init

为代码审查收集所有必要的上下文材料。

## 流程

### 1. 确定比较基准

用户指定的固定点——commit SHA、分支名、tag、`main`、`HEAD~N` 等。如果用户没指定，用 `show(customer information required)` 询问："对比什么——分支、commit、还是 main？"

确定后执行：

```
git diff <fixed-point>...HEAD        # 三点比较，基于 merge-base
git log <fixed-point>..HEAD --oneline
```

### 2. 识别 spec 来源

按以下顺序查找：

1. commit message 中的 issue 引用（`#123`、`Closes #45`）
2. 用户传入的路径参数
3. `docs/`、`specs/` 下与分支名或功能匹配的文件
4. 都找不到 → 用 `show(customer information required)` 询问用户。用户说没有 → 记录"无 spec"

### 3. 识别 standards 来源

扫描以下位置：

- `AGENTS.md`、`CLAUDE.md`
- `CONTRIBUTING.md`
- `docs/adr/`（架构决策即标准）
- `.editorconfig`、`eslint.config.*`、`biome.json`、`tsconfig.json`（机器强制的标准——记录但不重复检查）
- `STYLE.md`、`STANDARDS.md` 等

### 4. 产出概览

作为完整 review 管线的准备阶段时，用 `show(production record)` 提交以下上下文并继续 review-spec 和/或 review-standards。
只有客户明确只要求收集审查上下文时，才用 `show(qualified delivery)`：

```
【阶段】Review Init
【比较基准】<fixed-point>...HEAD
【涉及文件】N 个文件，M 个 commit
【Spec 来源】（路径/issue 编号 / 无 spec）
【Standards 来源】（列出找到的标准文件）
【Diff 概览】（按模块/目录分组的变更摘要）
```

完成后，根据用户需要继续执行 review-spec 和/或 review-standards。
