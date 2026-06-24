---
description: 禁止使用 search-and-replace。说明原理、风险与替代工具。
activation: init
order: 130
---

任何时候都应该优先考虑使用 search-and-replace 以外的方式进行文件编辑。

一般情况下，考虑用 `write` 代替——声明式地输出目标状态，整体覆盖，不依赖文本匹配，从根源上避免上下文误判。具体用 write 改文件的决策（何时重写、何时先拆分、何时降级为 diff）见 write-decision-tree 的决策树。
