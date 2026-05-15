# grill-with-docs (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Methodology**（主要）+ **Directive**（次要，交互调制）。挑战式问答流程 + 文档维护规则。

## B. 作用与核心思想

对用户的计划进行穷举式提问，同时维护项目的领域词汇表（CONTEXT.md）和架构决策记录（ADR）。

行为模式：
1. **一次一个问题**——遍历设计树的每个分支，逐个解决依赖关系
2. **优先查代码**——能通过探索代码库回答的问题不问用户
3. **挑战模糊用语**——用户用到与 CONTEXT.md 冲突的术语时立即指出
4. **内联更新文档**——术语确定后立即写入 CONTEXT.md，不攒到最后
5. **克制地提供 ADR**——只在同时满足"难以逆转 + 无上下文会困惑 + 真正的取舍"三个条件时才记录

核心思想有两层：
1. **通过提问对齐认知**——与 grill-me 类似，但增加了文档维护
2. **建立共享语言**——CONTEXT.md 不是文档，是词汇表。它让模型和人用同一套术语，减少冗余表达

附带的文档格式规范（CONTEXT-FORMAT.md, ADR-FORMAT.md）定义了极简但有效的文档结构。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。当前是纯对话式 skill，没有使用工具或 progress。

如果整合进我们的系统：
- 代码探索 → observe
- 文档写入 → write/edit（CONTEXT.md, ADR）
- 问答循环 → progress(blocked)（每个问题一个 blocked）
- 但这会改变 grill-with-docs 的核心交互模式——它设计为快速一问一答，不适合 progress(blocked) 的"提交后等待"节奏

**值得借鉴的内容**：CONTEXT.md 词汇表理念（减少模型冗余表达）、ADR 的三条件门槛（难以逆转 + 无上下文会困惑 + 真正取舍）。但这些更适合作为项目实践，不一定需要做成 skill。

## 人类评价

感觉context可以并入 AGENTS.md (每次启动自动加载)，这样能够统一表述。

ADR 可能需要考虑一下，不过因为没有冲突点，感觉可以试试看。

## AI 回应

**CONTEXT 并入 AGENTS.md**：合理。AGENTS.md 本身就是"每次启动自动加载"的项目级配置，领域词汇表作为一个小节放进去可以统一入口。不需要单独的 CONTEXT.md 文件。

**ADR**：可以试试。ADR 的三条件门槛（难以逆转 + 无上下文会困惑 + 真正取舍）足够克制，不会产生大量无用文档。我们的 docs/ 目录已经有类似实践（design-skill-integration.md、annotation-interaction-paradigm.md），只是没有用 ADR 的编号格式。

分类修正：grill-with-docs 归为 **Task**（具体任务：对计划进行挑战式问答并维护文档）。