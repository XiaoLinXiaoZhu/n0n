# bugfix

> 来源：builtin | 激活：auto

## A. 类型组成

**Methodology**（主要）。8 个步骤的线性 SOP，每步有退出条件和 progress 格式模板。

## B. 作用与核心思想

强制执行诊断流程，防止模型看到 bug 就直接改代码。

8 步流程：格物定位 → 红灯复现 → 对齐标准 → 追溯根源 → 尝试修复 → 绿灯验证 → 横向排查 → 请求验收。

核心思想有两层：
1. **先理解再动手**——前 4 步全部是调查，禁止任何修改
2. **progress 格式化退出条件**——每步必须提交一份满足格式的 `progress(working)` 报告，填不上字段说明该步没做到位，必须回退

这种"报告驱动的步骤推进"机制是 bugfix skill 最独特的设计：不是靠文字说教约束模型行为，而是用结构化的输出格式让模型自我检验。

## C. 与执行工具和 progress 的结合潜力

**已深度结合**。这是当前所有 skill 中与 progress 结合最好的一个。

每个步骤天然映射到工具类型：
- 格物定位、红灯复现 → observe（探索代码/日志/复现）
- 对齐标准、追溯根源 → observe + reason（分析根因、定义验收条件）
- 尝试修复 → act（修改代码）
- 绿灯验证 → act + observe（运行测试、检查结果）
- 横向排查 → observe（搜索同类问题）

progress 的三种状态在流程中各有位置：
- `progress(working)`：步骤 1-7 的退出报告
- `progress(blocked)`：步骤 3 中需要用户确认验收条件时
- `progress(completed)`：步骤 8 的最终验收报告

**可改进方向**：融入 mattpocock/diagnose 的"构建反馈循环"理念——当前的"红灯复现"步骤只要求"复现问题"，但 diagnose 强调应该花大量精力构建一个 fast/deterministic/agent-runnable 的 pass/fail 信号，这比简单复现更有价值。

## 人类评价

没有啥，参考另外一个。

## AI 回应

分类修正：bugfix 应归为 **Task** 而非 Methodology——它指向一个具体任务（修 bug），SOP 是服务于这个任务的流程。

关于"参考另外一个"：已记录。bugfix 和 diagnose 的融合方向在 diagnose 评论中讨论。