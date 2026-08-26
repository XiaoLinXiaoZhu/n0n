---
description: 澄清 HITL issue 中必须由客户承担的信息、决定或操作，将已解除阻塞的 issue 转换为 AFK。当用户说"卡住了"、"帮我想想这个"、或 dispatch 遇到 HITL issue 时触发。
alias: mwf-resolve
activation: manual
---

# Resolve HITL（HITL → AFK 转换）

通过针对性的调查和客户参与，将 HITL blocked 的 issue 转换为 AFK-ready。

参考 `_shared.md` 了解 Issue 模型和状态机。

## 前置条件

存在一个或多个处于 `hitl-blocked` 状态的 issue，或者用户主动提出需要讨论某个 HITL 问题。

## 流程

### 1. 理解阻塞

用 `observe` 读取 HITL issue 的内容和 `hitlNotes`，用 `reason` 理解阻塞原因：

- **公共契约或范围**：架构/接口方案会改变客户可见行为、兼容性或订单范围
- **设计验收**：订单明确要求客户对 UI/UX 产品方向作主观验收
- **业务规则**：领域逻辑不清晰
- **权限/配置**：需要外部系统访问权
- **范围判断**：不确定这个该不该做

普通内部架构、接口、测试和 UI 实现判断不是 HITL。能由生产方依据代码、项目口径和证据关闭时，
直接形成决定并将 issue 重新分类为 AFK。

如果用户指定了某个 issue（"MWF-03 卡住了"），聚焦到该 issue。否则列出所有 HITL issue，让用户挑选。

### 2. 准备质询

用 `reason` 根据阻塞类型准备具体问题。**一次一个问题**，每个问题附上你的推荐答案，并按客户参与的性质选择类型：

- 客户掌握的事实、既有业务规则、背景或权限现状缺失：`show(customer information required)`
- 需要客户决定业务结果、订单范围、公共契约、授权、重大风险或契约要求的设计审查：`show(customer decision required)`
- 需要客户创建账号、调整权限或执行其他外部操作：`show(customer action required)`

等待用户反馈后再继续。

能通过探索代码库回答的问题（observe），不问用户。

#### 质询模板（按阻塞类型）

| 阻塞类型 | 典型问题 | 目标 |
|---------|---------|------|
| 公共契约 | "方案 A 与 B 会产生这些外部行为差异……本次契约采用哪个？" | 明确客户可见契约 |
| 设计验收 | "两个方向满足同一功能，但体验取舍如下……本次产品方向采用哪个？" | 完成契约要求的主观验收 |
| 业务规则 | "当 X 发生时，系统应该怎么做？两种可能：A 或 B。哪个？" | 精确定义行为 |
| 范围判断 | "这个 issue 是否可以先做一个最小可用版本？缺少的部分单独开 issue？" | 缩窄范围 |
| 外部依赖 | 先用信息请求确认现有访问状态；若确认需要客户创建账号或改变权限，再用独立的操作请求 | 取得可执行访问条件 |

### 3. 记录决策

每个问题确认后：
- 用 `write` 更新 issue 的 `hitlNotes`，记录决策内容
- 如果决策涉及 ADR 条件，用 `write` 写入 docs/adr/
- 如果决策引入或修改了领域术语，用 `write` 更新词汇表

### 4. 判定是否可转换

当一个 HITL issue 的所有阻塞点都被解决后，用 `reason` 判断：

- **可转为 AFK** → 更新 issue: `type: AFK`, `status: afk-ready`，清空 `hitlNotes` 或保留为上下文参考
- **需拆分为子 issue** → 阻塞点复杂时，拆为"决策 issue（仍为 HITL）→ 实现 issue（AFK）"
- **仍需人类** → 更新 `hitlNotes` 后保持 `hitl-blocked`，明确说明还缺什么

### 5. 报告转换结果

目标阻塞已经解决时，按调用范围选择消息类型：作为完整 `@mwf` 管线阶段时使用 `show(production record)` 并回到 Dispatch；
客户直接调用 `@mwf-resolve` 且本次订单只要求解决该阻塞时，使用 `show(qualified delivery)`。
两种情况的内容均可采用以下结构：

```
【阶段】Resolve HITL
【处理 issue】MWF-03
【原始类型】HITL — <阻塞原因>
【解决过程】
  - Q1: <问题> → <决策>
  - Q2: <问题> → <决策>
【转换结果】已转为 AFK / 已拆分且所有新阻塞均有明确处理路径
【词汇/ADR 更新】<如有>
【下一步】继续 resolve 其他 HITL / 回到 dispatch
```

如果仍有未解决的阻塞且客户参与可用，按当前缺少的是信息、决定还是外部操作，继续使用对应的 customer required 类型质询。
只有目标阻塞已解决且当前订单以此为完整目标时才提交 `show(qualified delivery)`。客户明确移除相关 issue 时，必须先把范围修订更新为有效契约；
剩余范围全部验收通过后才使用 `show(qualified delivery)`，并在正文明确说明范围修订已先更新有效契约。客户撤回整个订单且不要求验收现有产物时，使用 `show(customer cancelled)`。
不存在可继续的等待路径时，按实际边界使用 `show(production suspended)` 或 `show(production failed)`。
