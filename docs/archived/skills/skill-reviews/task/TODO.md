# Task Skill 重写计划

本文档记录 `data/skills/task/` 下各 task skill 的重写方向。每组 task 基于评审讨论结论，结合我们已有的 init skill（show-usage、observe-reason-act 等）和工具体系进行适配。

**通用重写原则**：
- 读者是 agent，用祈使句下指令，不写面向人类的解释
- 每个步骤明确关联工具（observe/reason/act）和 progress 状态
- 退出条件用 progress 格式模板定义——填不上字段说明没做到位
- 中文

---

## bug-fix — 修复 Bug

**当前状态**：`data/skills/task/bugfix/SKILL.md` 已有（8 步 SOP）。

**重写方向**：融合 mattpocock/diagnose 的"构建反馈循环"理念。

| 要点 | 说明 |
|------|------|
| 强化"红灯复现"步骤 | 不只是"复现问题"，而是"构建 fast/deterministic/agent-runnable 的 pass/fail 信号"。参考 diagnose 的 10 种构建方式 |
| 保留 git blame 溯源 | diagnose 没有这一步，但对大型代码库的根因定位很关键 |
| 保留横向排查 | diagnose 只修当前 bug，我们要求"发现一处，排查所有同类" |
| 多假设排名 | 参考 diagnose Phase 3：生成 3-5 个排名假设再测试，防止单假设锚定 |
| debug log 带前缀 | 参考 diagnose Phase 4：`[DEBUG-xxxx]` 前缀，清理时 grep 一下 |
| 复盘 | 参考 diagnose Phase 6：修复后回答"什么能防止这个 bug？" |

---

## refactor — 重构代码

**当前状态**：`data/skills/task/refactor/SKILL.md` 已有（6 步 SOP）。

**重写方向**：融入"显性遍历"原则和 improve-codebase-architecture 的实用技术。

| 要点 | 说明 |
|------|------|
| 显性遍历 | "理解现状"步骤中，每 3-4 次观察后提交 progress(working) 小结，不要读完所有内容后一次性总结 |
| 基于实验 | 在 git 可撤回的前提下，直接尝试重构（act）然后看效果（observe），比纯 reason 推演更高效 |
| 可选：复杂度度量 | 引入代码复杂度 lint（行数、圈复杂度）作为客观依据，而非纯感觉判断"是否需要重构" |
| depth/deletion-test | 从 improve-codebase-architecture 借鉴：删掉这个模块后复杂度是消失还是散落？作为判断"值不值得重构"的快速检验 |

---

## review — 代码审查

**当前状态**：无已有 skill。参考 mattpocock/review 的双轴设计。

**重写方向**：拆为三个可组合的子 task。

| 子 task | 职责 |
|---------|------|
| review-init | pin fixed point，收集 diff（`git diff`），识别 spec 来源和 standards 来源。产出：diff 概览 + 引用。progress(working) |
| review-spec | 对照 spec 逐条检查 diff。产出：缺失需求、范围蔓延、实现偏差。progress(working) |
| review-standards | 对照 standards（AGENTS.md、lint 配置等）逐条检查 diff。跳过工具已强制的规则。progress(working) |

常规流程：review-init → review-spec → review-standards。用户可选择只跑其中一个。

---

## planning — 需求规划

**当前状态**：无已有 skill。参考 mattpocock 的 grill-with-docs / to-prd / to-issues / triage / prototype。

**重写方向**：按需逐个添加。优先级判断：

| skill | 优先级 | 理由 |
|-------|--------|------|
| grill-with-docs | 中 | CONTEXT 可并入 AGENTS.md；ADR 三条件门槛值得采用。需适配 progress(blocked) |
| to-prd | 中 | 对话→PRD 的无损转换，与 grill-with-docs 形成管线 |
| to-issues | 中 | 拆分为 vertical slice issue，适合大型项目 + worktree 并行 |
| triage | 低 | 依赖 issue tracker 配套设施 |
| prototype | 中 | 无副作用的探索性 task，throwaway 标记是核心约束 |

---

## writing — 写作

**当前状态**：无已有 skill。参考 mattpocock 的 writing-beats / writing-fragments / writing-shape。

**重写方向**：三者形成管线 fragments（发散）→ shape 或 beats（收敛）→ 成品。按需迁移到我们的框架中。

重写要点：
- writing-beats：每个 beat 选择用 progress(blocked) 呈现候选
- writing-fragments："静默追加"模式，用 write 工具，不需要 blocked 确认
- writing-shape：格式选择争论用 progress(blocked)

---

## maintenance — 系统维护

**当前状态**：无已有 skill。disk-cleanup 当前在用户自定义 skill 中。

**重写方向**：如需 builtin 化，重写时将五级分类标准保留，将 progress(blocked) 绑定到等级 4（用户数据需确认）。

---

## setup — 项目初始化

**当前状态**：无已有 skill。参考 mattpocock/setup-matt-pocock-skills 的引导式配置模式。

**重写方向**：做一个 `project-init` task skill，包含：
- monorepo 偏好（apps/xxx + packages/xxx，bun workspace）
- 引导式配置（解释→选择→确认的小循环，每项配置一个 progress(blocked)）
- 可选配置项：issue tracker、lint 配置、CI 模板等

---

## meta — 关于 Skill 本身

**当前状态**：无已有 skill。参考 mattpocock 的 write-a-skill / handoff。

| skill | 重写要点 |
|-------|---------|
| write-a-skill | description 写法 + review checklist。行数限制不硬性约束 |
| handoff | 最好的交接物是项目本身（代码→注释→模块入口→文档的优先级链）。handoff 文档只记录"项目本身无法自解释的内容"（进行中的工作上下文、尚未落地的决策） |
