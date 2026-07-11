---
alias: mwf
description: Mattpocock 工作流引擎。从 idea 到 issue 拆分、HITL 解决、AFK 派发的完整管线。当用户说"我们开始做这个功能"、"走一遍流程"、"帮我处理这个任务"时使用。
activation: manual
---

# Mattpocock Workflow (@mwf)

完整的工作流引擎：将 idea 转化为可执行的 issue，处理 HITL 阻塞，派发 AFK 任务。`@mwf` 内部使用 `observe` / `reason` / `act` / `show` 驱动全流程。

参考 `_shared.md` 了解公共概念（Issue 模型、状态机、Session）。

## 启动方式

```
@mwf <意图描述>
```

用户有三种启动方式：

### 方式 A：完整管线

从 idea 开始，走完 init → plan → split → dispatch 全流程。

```
@mwf 我想做一个用户通知系统，用户可以订阅事件通知
```

`@mwf` 判断当前上下文：
- 有 plan 吗？→ 没有 → 进入 plan 阶段
- 有 issues 吗？→ 没有 → 进入 split 阶段
- 有 session 吗？→ 创建 session

### 方式 B：直达子 skill

直接用别名跳转到某个阶段。

```
@mwf-init       # 初始化仓库配置
@mwf-plan       # 质询 + PRD（plan 阶段）
@mwf-split      # 纵向切片拆分
@mwf-resolve    # 处理 HITL 阻塞
@mwf-dispatch   # 派发/执行 issue
@mwf-status     # 查看 session 状态
```

也支持通过 `@mwf` 派发器间接进入：

```
@mwf init ...       # 从派发器进入 init
@mwf plan ...       # 从派发器进入 plan
@mwf split ...      # 从派发器进入 split
@mwf resolve-hitl ...  # 从派发器进入 resolve-hitl
@mwf dispatch ...   # 从派发器进入 dispatch
@mwf status         # 从派发器进入 status
```

### 方式 C：继续 session

session 已存在时，`@mwf` 自动恢复上下文。

```
@mwf 继续              # 继续当前 session
@mwf MWF-03 卡住了    # 处理特定 issue
```

## 派发逻辑

`@mwf` 收到用户输入后：

1. **检查 session** — 用 `observe` 检查 session（当前上下文是否有活跃 session？）
2. **解析意图** — 用 `reason` 解析意图（用户想做什么？init / plan / split / resolve-hitl / dispatch / status）
3. **路由到子 skill** — 路由到对应的子 skill
4. **维护 session** — 用 `act` 维护 session（每次子 skill 完成后更新 session 状态）

### 意图判断规则

| 用户说 | 路由到 |
|--------|--------|
| "初始化" / "配置" / "设置项目" | `init` |
| "我想做..." / "有个想法" / "计划一下" | `plan` |
| "拆分" / "拆 issue" / "分解" | `split` |
| "卡住了" / "想不通" / "帮我想想" / "这个 HITL" | `resolve-hitl` |
| "开始做" / "派发" / "干吧" / "执行" | `dispatch` |
| "状态" / "进度" / "怎么样了" | `status` |
| "继续" / "下一个" | 推断当前阶段并继续 |

意图不明确时，用 `show(ask user question)` 询问用户想进入哪个阶段。

## Session 维护

`@mwf` 在上下文中维护一个 session 对象。子 skill 不直接修改 session 的顶层状态——它们在 `show(working log/final report)` 中报告变更，由 `@mwf` 负责更新 session。

Session 在以下情况重置：
- 用户明确说"重新开始"、"换个事情"
- plan 阶段产出新的 plan（覆盖旧 session）

> **关于 `act` / `show`**：子 skill 通过 `show(working log/final report)` 报告进度，由 `@mwf` 用 `act` 执行状态变更。子 skill 不直接修改 session 顶层状态。

---

**子 skill**：

| 直达别名 | 内容 | 说明 |
|---------|------|------|
| `@mwf-init` | init | 仓库初始化 |
| `@mwf-plan` | plan | 质询 + PRD 管线 |
| `@mwf-split` | split | 纵向切片拆分 |
| `@mwf-resolve` | resolve-hitl | HITL → AFK 转换 |
| `@mwf-dispatch` | dispatch | 派发/执行 issue |
| `@mwf-status` | status | 会话状态概览 |

--- *公共概念见 `_shared.md`* ---
