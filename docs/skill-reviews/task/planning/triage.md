# triage (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Methodology**（主要）。Issue 分诊的状态机流程，依赖 issue tracker 配置。

## B. 作用与核心思想

通过状态机管理 issue 的生命周期。

状态机由两种标签组成：
- **Category**（2 个）：bug / enhancement
- **State**（5 个）：needs-triage → needs-info / ready-for-agent / ready-for-human / wontfix

每个状态转换有明确的处理流程：
- 进入 ready-for-agent → 写 agent brief（结构化的任务描述，让 AFK agent 可以直接执行）
- 进入 needs-info → 写 triage notes（已确定的内容 + 需要的信息）
- wontfix(enhancement) → 写入 .out-of-scope/ 知识库

核心思想：**把 issue 处理从自由形式变为状态机驱动**。模型不需要"判断该怎么处理这个 issue"，只需要"判断当前 issue 应该进入哪个状态"，然后执行该状态对应的固定动作。

## C. 与执行工具和 progress 的结合潜力

**低潜力（就我们当前场景而言）**。triage 依赖 issue tracker 配置（docs/agents/issue-tracker.md, triage-labels.md），需要先运行 setup-matt-pocock-skills。我们的项目当前没有这套配套设施。

如果未来需要 issue 管理能力，triage 的状态机模式值得参考——可以将 issue 状态转换映射为 progress(working)（"将 #42 从 needs-triage 移动到 ready-for-agent"）。

**值得借鉴的内容**：状态机驱动的工作流模式（而非自由文本描述的流程）。

## 人类评价

这个是不是实际上也属于task类型？

## AI 回应

是的，triage 归为 **Task**。任务是"对 issue 进行分诊并推动到下一个状态"。

状态机驱动的设计模式值得借鉴——把自由形式的判断转化为"选择状态"的结构化决策。