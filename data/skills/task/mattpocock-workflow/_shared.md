# Mattpocock Workflow — 公共概念

本文件定义 `mattpocock-workflow` 体系中的所有子 skill 共享的数据模型和术语。

---

## 1. Issue 模型

每个 issue（任务单元）由以下字段描述：

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 唯一标识，格式如 `MWF-01` |
| `title` | `string` | 简短描述 |
| `description` | `string` | 端到端行为描述，不写具体文件路径 |
| `acceptanceCriteria` | `string[]` | 验收条件清单 |
| `type` | `"AFK" \| "HITL"` | 是否需要客户参与 |
| `status` | `IssueStatus` | 当前生命周期阶段（见下） |
| `blockedBy` | `string[]` | 被哪些 issue id 阻塞，空数组表示无阻塞 |
| `blocking` | `string[]` | 阻塞哪些 issue id |
| `parentPlan` | `string` | 所属 plan/PRD 的引用 |
| `hitlNotes` | `string` | HITL 相关的决策记录或待讨论问题 |
| `result` | `string` | 完成后的产出摘要 |

## 2. Issue 状态机

```
                   ┌──────────────┐
                   │   pending    │  ← 刚创建，待定
                   └──────┬───────┘
                          │
                   ┌──────▼───────┐
                   │ afk-ready    │  ← 已就绪，agent 可直接执行
                   └──────┬───────┘
                          │
              ┌───────────┼───────────┐
              │           │           │
     ┌────────▼───┐ ┌────▼────┐ ┌───▼────────┐
     │ in-progress │ │ hitl-   │ │ hitl-      │
     │ (AFK 执行中) │ │ blocked │ │ resolved   │
     └────────┬───┘ └────┬────┘ └───┬────────┘
              │           │           │
              │   ┌───────┘           │
              │   │  (resolve-hitl)   │
              │   │   重新分类为 AFK  │
              │   ▼                   │
              │ ┌─────────┐          │
              │ │ afk-    │──────────┘
              │ │ ready   │
              │ └────┬────┘
              │      │
              └──────┤
                     │
              ┌──────▼───────┐
              │    done      │  ← 完成
              └──────────────┘

              ┌──────────────┐
              │   wontfix    │  ← 不做
              └──────────────┘
```

- `pending` — 刚创建，尚未评估
- `afk-ready` — 已充分定义，agent 可直接实现
- `in-progress` — 正在被执行
- `hitl-blocked` — 缺少客户独占信息，或等待客户对业务结果、范围、公共契约、授权、重大风险或契约要求的设计验收承担责任
- `hitl-resolved` — HITL 已解决，可重新分类为 afk-ready
- `done` — 完成并通过验收
- `wontfix` — 决定不做

## 3. Session 模型

一次 `@mwf` 调用建立一个 session，包含：

| 字段 | 说明 |
|------|------|
| `sessionId` | 当前会话标识 |
| `plan` | 当前的 plan 文档路径或引用 |
| `issues` | `Issue[]` — 当前所有 issue |
| `startedAt` | 开始时间 |
| `currentFocus` | 当前正在处理的 issue id（如有） |

Session 由 `@mwf` 在上下文中维护，子 skill 通过上下文读取和更新。

## 4. 工作流管线

```
@mwf ──→ plan ──→ split ──→ dispatch ──→ done
              ↑         ↑          │
              │         │    ┌─────┘
              │         │    │
              │    ┌────┴────┴──┐
              │    │ resolve-   │
              │    │ hitl       │
              │    └────────────┘
              │         ↑
              └─────────┘  (HITL issue 出现时)
```

四个核心阶段 + 一个辅助阶段：
1. **plan** — 质询+PRD
2. **split** — 拆分为纵向切片 issue
3. **resolve-hitl** — 取得必要的客户信息、决定或操作，将 HITL 转为 AFK
4. **dispatch** — 消费/执行 issue

## 5. 命名约定

- issue id: `MWF-01`, `MWF-02`...（按创建顺序递增）
- 在 `@mwf` 上下文中用 `this session` 引用当前 session
- 子 skill 作为完整管线阶段时通过 `show(production record)` 报告 session 状态变更，由父流程继续并判定订单终态

---

*本文件不包含 frontmatter，不视为独立 skill。各子 skill 通过引用 `_shared.md` 中的定义确保一致。*
