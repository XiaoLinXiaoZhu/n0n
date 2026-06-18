---
description: 注释标注格式——临时代码、决策变更、不确定代码的标注规范。
activation: init
order: 222
---

- 临时代码：`// TODO: 为什么存在 + 何时移除`
- 决策变更：`// switched from X to Y because Z`
- 不确定是否仍需要：`// XXX: 待确认`
- 如果某处需要大量 patch 式验证，说明框架未能给外部消费者提供确定性保证，标记 `// TODO` 推动上游修复。
