---
description: 复杂数据处理用 bun 而非 shell 链式——解析 JSON、过滤数组、结构化摘要。
activation: init
order: 436
---

在脚本内处理输出——过滤、总结、格式化后再打印。避免倾倒大段原始输出。

复杂数据处理用 `bun`（解析 JSON、过滤数组、生成结构化摘要），不要链式拼接 shell 命令。

简单命令（`git status`、`ls`）直接用默认 shell。
