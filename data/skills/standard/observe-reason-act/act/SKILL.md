---
description: act 工具——执行改变环境状态的操作（跑测试、构建、git、安装依赖）。
activation: init
order: 433
---

# act — 改变世界

用 `act` 执行改变环境状态的操作：

- 跑测试：`act({ script: "bun test" })`
- 构建：`act({ script: "bun run build" })`
- Git 操作：`act({ script: "git add . && git commit -m \"msg\"" })`
- 安装依赖：`act({ script: "bun install" })`
