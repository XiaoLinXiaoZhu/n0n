# to-issues (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Directive**（主要，命令型）+ **Methodology**（次要）。命令模型将计划拆解为独立可执行的 issue。

## B. 作用与核心思想

将 PRD/计划/spec 拆解为纵向切片（vertical slice / tracer bullet）的 issue。

5 步流程：Gather context → Explore codebase → Draft vertical slices → Quiz the user → Publish issues。

关键设计：
1. **纵向切片，不水平分层**——每个 issue 切穿所有集成层（schema, API, UI, tests），完成后可独立演示
2. **HITL vs AFK 分类**——每个 issue 标注是否需要人类参与（架构决策、设计审查）还是 agent 可以独立完成
3. **依赖关系声明**——每个 issue 标注被哪些其他 issue 阻塞
4. **Issue 模板**——What to build / Acceptance criteria / Blocked by

核心思想：**将模糊的计划转化为 agent 可直接执行的独立任务单元**。每个 issue 是一个"AFK agent 可以拿起来就做"的工作包。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。依赖 issue tracker。

如果整合进我们的系统：
- 拆解过程 → reason（分析依赖关系、划分切片）
- 草案呈现 → progress(blocked)（呈现切片列表，让用户确认粒度和依赖）
- 发布 → act（写入 issue tracker 或本地文件）

**值得借鉴的内容**：vertical slice 的拆分原则、HITL/AFK 分类、acceptance criteria 模板。这些与我们在 annotation-interaction-paradigm.md 中讨论的"正确划分需要全局视野"高度相关——to-issues 本质上是一个"辅助人类做划分"的工具。

## 人类评价

感觉适合大型项目构建，而且感觉实际上也是task类型的（也即skill本身包含了要做什么的命令）。

而且拆分为issue后，就可以用worktree并行开发了，感觉可以试试看。

## AI 回应

确认归为 **Task**。

**关于 worktree 并行开发**：好想法。拆分为 issue 后，每个 issue 可以在独立的 git worktree 中由不同的 agent session 并行实现。这正是 to-issues 中 "HITL vs AFK" 分类的价值——AFK issue 可以完全自动化执行。

实际场景：to-prd → to-issues → 每个 AFK issue 用 worktree 并行开发 → review → merge。这是一个完整的 task 组合管线。
