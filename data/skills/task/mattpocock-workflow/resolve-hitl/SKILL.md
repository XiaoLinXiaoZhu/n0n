---
description: 盘问人类来解析 HITL issue 的决策阻塞，将 HITL 转换为 AFK。当用户说"卡住了"、"帮我想想这个"、或 dispatch 遇到 HITL issue 时触发。
alias: mwf-resolve
activation: manual
---

# Resolve HITL（HITL → AFK 转换）

通过针对性的质询，将 HITL blocked 的 issue 转换为 AFK-ready。

参考 `_shared.md` 了解 Issue 模型和状态机。

## 前置条件

存在一个或多个处于 `hitl-blocked` 状态的 issue，或者用户主动提出需要讨论某个 HITL 问题。

## 流程

### 1. 理解阻塞

用 `observe` 读取 HITL issue 的内容和 `hitlNotes`，用 `reason` 理解阻塞原因：

- **架构决策**：多个方案之间的选择
- **设计审查**：UI/UX 方向不确定
- **业务规则**：领域逻辑不清晰
- **权限/配置**：需要外部系统访问权
- **范围判断**：不确定这个该不该做

如果用户指定了某个 issue（"MWF-03 卡住了"），聚焦到该 issue。否则列出所有 HITL issue，让用户挑选。

### 2. 准备质询

用 `reason` 根据阻塞类型准备具体问题。**一次一个问题**，用 `show(ask user question)` 提出，每个问题附上你的推荐答案。等待用户反馈后再继续。

能通过探索代码库回答的问题（observe），不问用户。

#### 质询模板（按阻塞类型）

| 阻塞类型 | 典型问题 | 目标 |
|---------|---------|------|
| 架构决策 | "方案 A（X）和方案 B（Y）的区别是……你倾向于哪个？" | 明确选型 |
| 设计审查 | "现有类似功能的模式是……这个是否遵循同样的模式？" | 对齐现有模式 |
| 业务规则 | "当 X 发生时，系统应该怎么做？两种可能：A 或 B。哪个？" | 精确定义行为 |
| 范围判断 | "这个 issue 是否可以先做一个最小可用版本？缺少的部分单独开 issue？" | 缩窄范围 |
| 外部依赖 | "我们需要访问 Z 系统。你有访问权限吗？或者可以创建 service account？" | 确权或绕过 |

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

**退出 → 提交 `show(final report)`：**

```
【阶段】Resolve HITL
【处理 issue】MWF-03
【原始类型】HITL — <阻塞原因>
【解决过程】
  - Q1: <问题> → <决策>
  - Q2: <问题> → <决策>
【转换结果】已转为 AFK / 拆分为子 issue / 仍为 HITL（说明原因）
【词汇/ADR 更新】<如有>
【下一步】继续 resolve 其他 HITL / 回到 dispatch
```

如果仍有未解决的阻塞，保持 `show(ask user question)` 继续质询。只有所有阻塞都解决或明确放弃时，提交 `show(final report)` 并退出。
