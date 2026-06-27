---
description: 派发并执行 AFK-ready 的 issue，遇到 HITL 时路由到 resolve-hitl。当用户说"开始做"、"派发"、"干吧"时由 @mwf 自动路由。
activation: manual
alias: mwf-dispatch
---

# Dispatch（派发与执行）

按依赖顺序消费 session 中的 issue，执行 AFK 任务，遇到 HITL 时路由到 resolve-hitl。

参考 `_shared.md` 了解 Issue 模型和状态机。

## 前置条件

session 中存在至少一个 `afk-ready` 或 `pending` 状态的 issue。

## 流程

### 1. 选择下一个 issue

用 `observe` 从 session 中读取 issue 列表，用 `reason` 按以下优先级计算：

```
1. 当前 focus 的 issue（session.currentFocus）— 继续未完成的工作
2. 无阻塞的 afk-ready issue — 按 id 升序
3. 无阻塞的 pending issue — 标记为 afk-ready 后选择
4. 阻塞已解除的 issue — 重新检查 blockedBy
```

用 `reason` 判断如果没有任何可执行的 issue（全部被阻塞或已完成），报告状态并建议：
- 有 HITL blocked → "建议先 resolve-hitl 处理 HITL"
- 全部完成 → "全部完成！"

### 2. 执行 issue

用 `observe` 读取 issue 的完整定义（description + acceptanceCriteria）。

#### AFK issue

用 `act` 直接实现，遵循 issue 中的：
- 端到端行为描述
- 验收条件

实现过程中，如果发现：
- **issue 定义不足** → 用 `show(ask user question)` 向用户补充确认（类似 resolve-hitl 但范围更窄）
- **发现新的依赖** → 更新 session 中的依赖关系
- **发现可以拆分更细** → 用 `show(ask user question)` 询问用户是否要拆分

**验收条件检查**：实现后用 `act` 逐条验证验收条件。全部通过才算完成。

完成后用 `act` 更新 session 中的 issue: `status: done`, `result: <产出摘要>`

#### HITL issue

不直接实现。更新 `status: hitl-blocked`，然后建议用户：
- 用 `resolve-hitl` 处理这个 HITL
- 或者暂时跳过，继续下一个 AFK issue

### 3. 检查下游阻塞

issue 完成后，用 `reason` 检查哪些 issue 被它阻塞。如果被阻塞的 issue 因此变为无阻塞状态，用 `act` 更新状态：

```
更新前: MWF-03 (blockedBy: [MWF-01])  →  status: pending
更新后: MWF-03 (blockedBy: [])        →  status: afk-ready
```

### 4. 继续循环

用 `show(ask user question)` 询问用户：

```
MWF-01 已完成（<验收结果>）
当前可执行：MWF-02（AFK，无阻塞），MWF-04（AFK，无阻塞）
HITL 等待处理：MWF-03（HITL blocked）

继续执行下一个 AFK？/ 处理 MWF-03 的 HITL？/ 查看状态？
```

用户选择后继续循环。

**退出 → 提交 `show(progress report)`，格式：**

```
【阶段】Dispatch
【已执行】<issue id> — <状态: done / in-progress / hitl-blocked>
【验收结果】<通过/失败（失败原因）>
【新解除的阻塞】<issue id> 从 blocked 变为 afk-ready
【当前可执行列表】<afk-ready 的 issue id>
【下一步】继续 dispatch / resolve-hitl / status
```

如果所有 issue 都已完成 → 提交 `show(final report)`，包含完整的 session 总结。
