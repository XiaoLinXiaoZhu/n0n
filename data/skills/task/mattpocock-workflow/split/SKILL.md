---
description: 将 plan/PRD 拆分为独立可执行的纵向切片 issue，标注 AFK/HITL 和依赖关系。当用户说"拆 issue"、"分解任务"时由 @mwf 自动路由。
alias: mwf-split
activation: manual
---

# Split（纵向切片拆分）

将 plan/PRD 拆分为独立可执行的纵向切片 issue。

参考 `_shared.md` 了解 Issue 模型和状态机。

## 前置条件

plan 阶段已完成，上下文中存在 plan 引用。

## 流程

### 1. 读取 plan

用 `observe` 读取 plan/PRD 内容。用 `reason` 理解所有用户故事、模块划分、技术决策。

### 2. 识别纵向切片

**核心原则：纵向切片，不水平分层。**

用 `reason` 分析切片方式。

每个 issue 切穿所有集成层（schema → API → UI → tests），完成后可独立演示或验证。

切片识别方法：
- 每个用户故事是否可拆为一个独立 issue？
- 多个相关的故事是否可以合并为一个纵向切片？
- 基础设施变更（schema 变更、新服务）是否可以作为独立切片？

### 3. 标注类型

每个切片标注：

用 `reason` 判断每个切片类型。

| 标注 | 含义 | 判断标准 |
|------|------|---------|
| `AFK` | Agent 可独立完成 | 需求充分定义、技术路径清晰、无外部依赖的决策 |
| `HITL` | 需要人类参与 | 涉及架构决策、设计审查、权限操作、业务规则判断 |

**优先 AFK，减少人类阻塞点。** 如果一个 HITL 可以拆为"先讨论决策（HITL）→ 再实现（AFK）"，拆成两个 issue。

### 4. 解析依赖关系

用 `reason` 分析依赖链。

确定每个 issue 被哪些 issue 阻塞：
- Schema 变更 → 阻塞使用该 schema 的 API 和 UI
- API 变更 → 阻塞使用该 API 的 UI
- 基础设施 → 阻塞所有依赖它的切片

### 5. 呈现给用户

用 `show(ask user question)` 呈现拆分方案：

```
计划拆分：<plan 标题>
共 N 个 issue，其中 M 个 AFK，K 个 HITL

| ID | 类型 | 标题 | 阻塞关系 |
|----|------|------|---------|
| MWF-01 | AFK | ... | 无阻塞 |
| MWF-02 | HITL | ... | 被 MWF-01 阻塞 |
| ...|

依赖图：
MWF-01 ──→ MWF-02 ──→ MWF-03
                ↓
           MWF-04 (HITL 分支)
```

请用户确认：
- 粒度是否合适？
- 依赖关系是否正确？
- AFK/HITL 分类是否正确？
- 是否有遗漏或多余的切片？

迭代直到用户批准。

### 6. 提交 session

确认后，用 `act` 在上下文中维护 issue 列表（session.issues）。

**退出 → 提交 `show(final report)`，格式：**

```
【阶段】Split — 完成
【总切片数】N
【AFK】M 个
【HITL】K 个
【依赖层数】<最长依赖链的层数>
【下一步】建议进入 dispatch 派发 AFK issue，或 resolve-hitl 处理 HITL blocked
```
