# diagnose (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Methodology**（纯粹）。6 阶段的 bug 诊断循环，每个阶段有明确的退出检查清单。

## B. 作用与核心思想

与我们的 bugfix skill 解决同一个问题（防止盲目修复），但切入角度截然不同。

6 阶段：构建反馈循环 → 复现 → 假设 → 插桩 → 修复+回归测试 → 清理+复盘。

**核心思想是一句话："Build the right feedback loop, and the bug is 90% fixed."**

这是 diagnose 最独特的贡献：Phase 1 不是"定位问题"，而是"构建一个 fast/deterministic/agent-runnable 的 pass/fail 信号"。它列举了 10 种构建反馈循环的方式（从 failing test 到 HITL bash script），并且要求把循环本身当作产品来迭代（更快、信号更尖锐、更确定性）。

其他值得注意的设计：
- Phase 3 要求生成 **3-5 个排名假设** 再测试（防止单假设锚定）
- Phase 4 的 debug log 必须带唯一前缀（`[DEBUG-a4f2]`），清理时 grep 一下就行
- Phase 6 要求回答"什么能防止这个 bug？"，如果答案涉及架构变更，交接给 improve-codebase-architecture skill

与 bugfix 的关键差异：
- bugfix 侧重"认知步骤"（格物、致知、对齐）——教模型怎么思考
- diagnose 侧重"反馈循环"——教模型怎么建立可靠的验证机制
- bugfix 有 progress 格式化报告，diagnose 没有
- diagnose 有跨 skill 交接（→ improve-codebase-architecture），bugfix 没有

## C. 与执行工具和 progress 的结合潜力

**高潜力但当前未结合**。diagnose 没有使用 progress 机制，没有步骤格式模板。

如果要整合进我们的系统：
- Phase 1（构建反馈循环）→ 主要用 act（写测试/脚本）+ observe（验证循环是否可用）→ progress(working) 报告循环的特性（速度、确定性、信号尖锐度）
- Phase 3（假设）→ reason（生成假设列表）→ progress(working) 列出排名假设 → 可选 progress(blocked) 让用户重排
- Phase 5（修复+回归测试）→ act → progress(working) 报告红→绿
- Phase 6（复盘）→ reason → progress(completed) 包含复盘结论

**最值得借鉴的内容**："构建反馈循环"理念和 10 种构建方式的清单，应考虑融入 bugfix skill。

## 人类评价

嗯，感觉它这个更加成熟，但是我感觉我的那个更合适。

这里主要假定bug需要通过增加额外的debug才能够调查清楚。

但是我们的处理有几步同样重要，尤其是 进行 git blame 溯源 和 横向排查

## AI 回应

同意。diagnose 在"构建反馈循环"这个维度更成熟，但我们的 bugfix 在两个点上有独到价值：

1. **git blame 溯源**——diagnose 完全没有这一步。追溯引入 bug 的 commit + 理解原始意图，是定位根因的重要手段，尤其在大型代码库中。
2. **横向排查**——diagnose 只关注当前 bug 的修复，不要求检查同类问题是否存在于其他位置。我们的"发现一处，逐一排查"是更彻底的处理方式。

融合建议：将 diagnose 的"构建反馈循环"理念（Phase 1 的 10 种方式 + 把循环当产品迭代）吸收进 bugfix 的"红灯复现"步骤，同时保留 bugfix 的 git blame 溯源和横向排查。两者不是替代关系而是互补。

分类修正：diagnose 也应归为 **Task**。 