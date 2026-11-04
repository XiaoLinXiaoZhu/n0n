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

从 session 文件（`.n0n/manual/mwf/session.md`，本 run 内刚写过则在上下文，否则 `exec://` 读取）读取 issue 列表，按以下优先级计算（内部推演）：

```
1. 当前 focus 的 issue（session.currentFocus）— 继续未完成的工作
2. 无阻塞的 afk-ready issue — 按 id 升序
3. 无阻塞的 pending issue — 标记为 afk-ready 后选择
4. 阻塞已解除的 issue — 重新检查 blockedBy
```

判断如果没有任何可执行的 issue（全部被阻塞或已完成），报告状态并建议：
- 有 HITL blocked → "建议先 resolve-hitl 处理 HITL"
- 全部完成 → "全部完成！"

### 2. 执行 issue

用 `post` 执行 `exec://` 读取 issue 的完整定义（description + acceptanceCriteria）。

#### AFK issue

直接实现（用 `post` 执行 `exec://` 运行、`write://` 落盘），遵循 issue 中的：
- 端到端行为描述
- 验收条件

实现过程中，如果发现：
- **issue 定义不足** → 用 `post` 发送 `customer://form/mwf-dispatch-facts` 向用户补充事实、要求或背景（类似 resolve-hitl 但范围更窄）
- **发现新的依赖** → 更新 session 文件中的依赖关系
- **发现可以拆分更细** → 在不改变订单范围和客户承担工作的前提下由生产方更新拆分；
  只有拆分会改变交付范围、公共契约或新增客户工作时才请求客户决定

**验收条件检查**：实现后用 `post` 执行 `exec://` 逐条验证验收条件。全部通过才算完成。

完成后更新 session 文件（`write://.n0n/manual/mwf/session.md`）中的 issue: `status: done`, `result: <产出摘要>`

#### HITL issue

不直接实现。更新 `status: hitl-blocked`，然后建议用户：
- 用 `resolve-hitl` 处理这个 HITL
- 或者暂时跳过，继续下一个 AFK issue

### 3. 检查下游阻塞

issue 完成后，检查哪些 issue 被它阻塞（内部推演）。如果被阻塞的 issue 因此变为无阻塞状态，更新 session 文件状态：

```
更新前: MWF-03 (blockedBy: [MWF-01])  →  status: pending
更新后: MWF-03 (blockedBy: [])        →  status: afk-ready
```

### 4. 继续循环

若客户要求逐项决定下一步，或下一个可执行项会改变客户承担的范围或风险，用 `post` 发送 `customer://question/mwf-dispatch-next`：

```
MWF-01 已完成（<验收结果>）
当前可执行：MWF-02（AFK，无阻塞），MWF-04（AFK，无阻塞）
HITL 等待处理：MWF-03（HITL blocked）

继续执行下一个 AFK？/ 处理 MWF-03 的 HITL？/ 查看状态？
```

用户选择后继续循环。

若订单已经授权按依赖顺序完成全部 AFK issue，则当前 issue 完成后更新 session 文件与 `todo://mwf` 条目并自主继续：

```
【阶段】Dispatch
【已执行】<issue id> — done
【验收结果】<逐项证据>
【新解除的阻塞】<issue id> 从 blocked 变为 afk-ready
【当前可执行列表】<afk-ready 的 issue id>
【下一步】继续 dispatch / 转入 resolve-hitl
```

退出判定按实际 session 状态，均以最终正文结束（不再调用任何工具，本周期自然结束）：

- 所有必交 issue 均完成且验收通过：正文包含完整 session 总结；
- 客户显式移除部分必交 issue：先将范围修订更新为有效契约；剩余范围全部验收通过后以最终正文结束，
  正文明确说明范围修订已先更新有效契约；
- 只剩有明确解除条件的阻塞项，且本周期不再等待：以最终正文结束并说明暂停原因；
- 验收失败且没有当前订单内的有效恢复路径：以最终正文结束并说明失败原因；
- 客户撤回整个订单且不要求验收现有产物：以最终正文结束并说明客户撤回。

`in-progress`、`hitl-blocked` 或验收失败不得在最终正文中声称完成。
