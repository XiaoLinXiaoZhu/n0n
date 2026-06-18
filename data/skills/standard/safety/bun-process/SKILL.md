---
description: 环境限制——按 PID/端口定向终止 bun 进程，不 killall。
activation: init
order: 26
---

你运行在一个 `bun` 进程中。需要终止 bun 进程时（如停止 dev server），按 PID 或端口定向终止——永远不要 `killall bun` 或 `pkill bun`，那会终止你自己。
