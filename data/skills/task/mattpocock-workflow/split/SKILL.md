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

用 `post` 执行 `exec://` 读取 plan/PRD 内容。理解所有用户故事、模块划分、技术决策（内部推演）。

### 2. 识别纵向切片

**核心原则：纵向切片，不水平分层。**

分析切片方式（内部推演）。

每个 issue 切穿所有集成层（schema → API → UI → tests），完成后可独立演示或验证。

切片识别方法：
- 每个用户故事是否可拆为一个独立 issue？
- 多个相关的故事是否可以合并为一个纵向切片？
- 基础设施变更（schema 变更、新服务）是否可以作为独立切片？

### 3. 标注类型

每个切片标注：

判断每个切片类型（内部推演）。

| 标注 | 含义 | 判断标准 |
|------|------|---------|
| `AFK` | Agent 可独立完成 | 需求充分定义、技术路径清晰、无外部依赖的决策 |
| `HITL` | 需要客户参与 | 缺少客户独占信息，或必须由客户决定业务结果、订单范围、公共契约、授权、重大风险或契约要求的设计验收 |

内部架构、技术方案和常规设计审查由生产方负责，不得仅因存在技术取舍就标为 HITL。
如果一个真实 HITL 可以拆为"先取得客户信息/决定/操作（HITL）→ 再实现（AFK）"，拆成两个 issue。

### 4. 解析依赖关系

分析依赖链（内部推演）。

确定每个 issue 被哪些 issue 阻塞：
- Schema 变更 → 阻塞使用该 schema 的 API 和 UI
- API 变更 → 阻塞使用该 API 的 UI
- 基础设施 → 阻塞所有依赖它的切片

### 5. 呈现给用户

issue 粒度、技术依赖和 AFK 分类由生产方依据 PRD、代码和工具能力确定。
若拆分会改变订单范围、公共契约或把新增工作分配给客户，用 `post` 发送 `customer://question/mwf-split-scope` 请求客户决定；
否则不请求客户，直接进入第 6 步。需要客户决定时，body 可采用以下结构：

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

customer://question 的 body 只列出会改变其范围、公共契约或承担工作的事项；不得要求客户替生产方校验技术依赖或 AFK 分类。

### 6. 提交 session

拆分结果成立且必要的客户决定完成后，更新 session 文件（`write://.n0n/manual/mwf/session.md`）维护 issue 列表（session.issues）。

作为完整 `@mwf` 管线的一部分时，更新 session 文件与 `todo://mwf` 条目后继续 Dispatch 或 Resolve HITL；
客户直接调用且本次订单只要求形成 issue 列表时，以最终正文结束（不再调用任何工具，本周期自然结束）并包含：

```
【阶段】Split — 完成
【总切片数】N
【AFK】M 个
【HITL】K 个
【依赖层数】<最长依赖链的层数>
【下一步】建议进入 dispatch 派发 AFK issue，或 resolve-hitl 处理 HITL blocked
```
