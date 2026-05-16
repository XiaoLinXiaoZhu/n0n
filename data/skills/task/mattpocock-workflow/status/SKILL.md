---
description: 查看当前 workflow session 的状态概览。当用户问"怎么样了"、"进度如何"、或 @mwf 自动路由时使用。
activation: manual
alias: [status, mwf-status]
---

# Status（会话状态概览）

展示当前 workflow session 的整体状态。

参考 `_shared.md` 了解 Issue 模型和状态机。

## 前置条件

上下文中存在活跃的 session。

## 流程

### 1. 汇总状态

用 `observe`/`reason` 遍历 session 中的 issue，并按状态分组：

| 状态 | 数量 | 说明 |
|------|------|------|
| pending | N | 待评估 |
| afk-ready | N | 可执行 |
| in-progress | N | 正在执行 |
| hitl-blocked | N | 等待人类 |
| hitl-resolved | N | 已解决待重分类 |
| done | N | 已完成 |
| wontfix | N | 不做 |

### 2. 依赖图

用 `reason` 分析依赖关系拓扑，高亮阻塞链：

```
MWF-01 [done] ──→ MWF-02 [afk-ready] ──→ MWF-03 [hitl-blocked] ← 阻塞！
                                           MWF-04 [pending]（无阻塞）
```

### 3. 瓶颈分析

用 `reason` 分析瓶颈，识别当前阻塞点：

- **最长的未完成链**：从某个 afk-ready 到最远的 pending issue 的路径长度
- **关键路径**：如果某个 issue 的延迟会影响最多下游
- **HITL 堆积**：如果 HITL issue 持续不被处理，建议 resolve-hitl

### 4. 建议下一步

用 `reason` 推断下一步建议，基于当前状态给用户一个具体的行动建议：

| 状态分布 | 建议 |
|---------|------|
| 有 afk-ready | "建议 dispatch 执行 MWF-XX" |
| 有 hitl-blocked | "建议 resolve-hitl 处理 MWF-XX" |
| 有 pending | "建议先 split 评估这些 pending issue" |
| 全部 done | "全部完成！🎉" |
| 空 session | "还没有 session，建议用 @mwf plan 开始" |

**退出 → 提交 `progress(completed)`，格式同上。**
