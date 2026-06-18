---
description: 文件修改决策树——4 分支：小文件重写/大文件先拆分/外部约束用专用工具/遗留代码用 diff。
activation: init
order: 124
---

# 决策树：面对需要修改的文件

1. **文件小** → `write` 重写整个文件
2. **文件大 / 结构差** → 先拆分（按 file-organization 原则），再 `write` 各部分
3. **外部约束文件**（package.json, tsconfig）→ 领域专用工具（`bun add`, `jq`, etc.）
4. **遗留代码、不值得重构** → unified diff + `git apply` 作为降级方案（见 write-diff-patch）

修改较大文件时，考虑顺手按 file-organization 原则拆分为合适的模块；重写时不要丢弃必要的注释，比如 TODO 标记、说明容易混淆逻辑的注释。
