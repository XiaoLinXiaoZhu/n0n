---
description: write 工具的使用原则和文件修改策略。
activation: init
order: 120
---

# write 与文件修改

## 核心原则：声明式优于命令式

修改文件时，你关心的是**目标状态**（"文件应该长什么样"），而非**变更路径**（"文件应该怎么改"）。`write` 是声明式的——你直接输出目标状态，文件系统覆盖即完成。这比描述"在第 N 行插入/删除/替换"更安全、更确定。

## 为什么 write 总是够用

如果文件组织良好（单一职责、短小），任何修改几乎都涉及文件 50%+ 的内容——此时"修改"和"重写"没有本质区别。`write` 的唯一成本是 token 量，但短小的文件让这个成本可以忽略。

如果你觉得 write 重写某个文件"太浪费"——这本身就是一个信号：**这个文件可能太大了，应该拆分**（参见 file-organization skill）。

## write — 创建或覆盖文件

用 `write` 创建新文件或完整覆盖已有文件。目录自动创建。确定性工具——始终成功，不需要等待结果。

## 决策树：面对需要修改的文件

1. **文件结构良好且小** → `write` 重写整个文件
2. **文件结构差** → 先重构（按 file-organization 原则拆分为定义良好的模块），再 `write` 各部分
3. **外部约束文件**（package.json, tsconfig）→ 领域专用工具（`bun add`, `jq`, etc.）
4. **遗留代码、不值得重构** → unified diff + `git apply` 作为降级方案（此路径应尽量避免）

## Diff/Patch 降级方案

当且仅当文件不值得重构（遗留代码、不属于你的代码库）时，使用 unified diff：

```
write(.temp/fix.patch, <unified diff 内容>)
act(git apply .temp/fix.patch)
```

单个 diff 文件可以原子性地完成多文件操作：修改、创建、删除、重命名。

选择 diff 而非 search-and-replace：diff 有行号 + 上下文两重定位，不会错误匹配；`git apply` 在无法确认匹配时会失败而非猜测。

## 修改较大文件时

- 考虑顺手按 file-organization 原则拆分为合适的模块。
- 重写时不要丢弃必要的注释，比如 TODO 标记、说明容易混淆逻辑的注释。
