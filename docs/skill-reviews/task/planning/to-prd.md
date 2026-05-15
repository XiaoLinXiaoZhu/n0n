# to-prd (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Directive**（主要，命令型）+ **Methodology**（次要）。命令模型将当前对话上下文合成为 PRD 文档。

## B. 作用与核心思想

将对话中已经讨论的内容（不做额外采访）综合为一份 Product Requirements Document，然后发布到 issue tracker。

PRD 模板包含：Problem Statement / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope / Further Notes。

关键设计：
1. **不做采访**——直接综合已有上下文，"just synthesize what you've already discussed"
2. **用户故事要极其详尽**——"A LONG, numbered list"
3. **关注 deep module**——实现决策中积极寻找可以提取为"接口简单、测试可独立"的深模块
4. **不含文件路径或代码片段**——因为会很快过时。例外：prototype 产出的状态机/schema 可以内联

核心思想：**从对话到文档的无损转换**。用户已经把需求说清楚了，模型的工作是结构化呈现，而不是重新提问。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。当前依赖 issue tracker 配置。

如果整合进我们的系统：
- 代码探索 → observe
- PRD 生成 → write（写入文件）
- 模块确认 → progress(blocked)（"拟定了以下模块划分，请确认"）
- 发布 → act（gh issue create 或写入本地文件）

**值得借鉴的内容**：PRD 模板结构，特别是"不含文件路径"的原则和"deep module"的检视角度。

## 人类评价

task 类型应该都是不冲突的，可以试试看的。

## AI 回应

同意。to-prd 是典型的 **Task**——"将当前对话综合为 PRD"就是任务本身。

与其他 task 不冲突——可以在 grill-with-docs 之后执行 to-prd，形成"澄清需求 → 生成文档"的流水线。