# improve-codebase-architecture (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Methodology**（主要）。3 阶段的架构改善流程，附带 3 个 reference 文件定义统一术语和具体技术。

## B. 作用与核心思想

发现代码库中的"浅模块"并将其加深——用更少的接口复杂度承载更多的功能。

3 阶段：Explore → Present candidates → Grilling loop。

核心概念体系（LANGUAGE.md）：
- **Module**——有接口和实现的任何东西（函数、类、包）
- **Depth**——接口处的杠杆率：大量行为藏在简单接口后面 = deep，接口几乎和实现一样复杂 = shallow
- **Seam**——可以在不编辑原地的情况下改变行为的位置
- **Deletion test**——想象删掉这个模块：复杂度消失说明它是 pass-through，复杂度散落到 N 个调用方说明它在发挥作用

核心思想：**把"浅模块→深模块"作为架构改善的唯一度量标准**。不是"代码更整洁"或"更符合 SOLID"，而是"接口更简单、实现更深厚"。

附带的 DEEPENING.md 详细定义了四种依赖类别（in-process / local-substitutable / remote-but-owned / true-external）及其对应的测试策略。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。当前设计依赖 Claude Code 的 subagent（Explore），我们的系统没有 subagent。

如果整合进我们的系统：
- Explore → observe（遍历代码库、搜索引用、查看模块接口）→ 多个 progress(working)（"发现浅模块 X：接口 N 个函数，实现只是 pass-through"）
- Present candidates → reason（整理发现列表）→ progress(blocked)（呈现候选列表，让用户选择）
- Grilling loop → 交替使用 observe（查代码验证讨论内容）和 progress(blocked)（逐个设计决策请用户确认）

**值得借鉴的内容**：depth/seam/deletion-test 概念体系。但这套体系较重（需要 CONTEXT.md + ADR 配套），适合作为独立安装的 user skill，不适合 builtin。

## 人类评价

其实感觉像是我们的思维实验模型在某个领域下更为深刻的使用。

要点实际上很简单就是：
- 大声说出来，而不是隐藏的评估或者推理，提供可证伪的链条
- 在可以使用git撤回的前提下，基于实验而非基于猜测
- 而且感觉可以使用一个linter专门做这个工作？代码复杂度可以简单使用代码行数和圈复杂度等评估。

## AI 回应

三个观察都很准确：

**"大声说出来"**：这就是 progress(working) 的核心价值——把隐藏的评估变为显式的声明。improve-codebase-architecture 的 Explore 阶段如果用我们的系统做，每发现一个候选浅模块就应该 progress(working)，而不是最后一次性列出。

**"基于实验而非猜测"**：在 git 可撤回的前提下，直接尝试重构（act）然后看效果（observe），比在 reason 中反复推演更可靠。这与 diagnose 的"构建反馈循环"理念一致——实际执行比纸上分析更有效。

**"用 linter 做这个工作"**：确实可以。代码行数、圈复杂度（cyclomatic complexity）、认知复杂度（cognitive complexity）等指标可以通过 ESLint 插件（eslint-plugin-sonarjs）或 biome 自动计算。这属于 capability 扩展——给模型一个"代码复杂度扫描"工具，让 Explore 阶段基于数据而非直觉。可以考虑做一个轻量的 capability skill 提供 complexity lint 命令。

分类修正：improve-codebase-architecture 归为 **Task**。