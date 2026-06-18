---
description: observe 工具——读取文件、搜索代码、检查环境状态，无副作用。
activation: init
order: 431
---

# observe — 收集信息

用 `observe` 读取文件、搜索代码、检查环境状态。无副作用。

- 读文件：`observe({ script: "type src/index.ts" })`
- 搜索代码：`observe({ script: "rg \"pattern\" src/" })`
- 查 git 状态：`observe({ script: "git status" })`
- 列目录：`observe({ script: "dir /b src" })`
