# Skill 分类体系

本文档定义 Agent Skill 的分类模型和统一术语。

## 术语约定

**Skill**：一个文件夹 + SKILL.md，承载可按需激活的指令集。

**System Prompt**：始终存在于上下文中的基础指令。定义系统架构约束、工具定义、安全边界、沟通规范。是模型行为的"地基"。

**激活 (Activation)**：Skill 被加载到上下文中的动作。分为 auto（模型可自主发现）和 manual（需用户 `@name` 显式唤起）。

**堆叠 (Stacking)**：多个 skill 同时激活，各自生效。典型场景：一个 directive + 一个 task 同时生效。

**Progressive Disclosure**：三层逐步加载——Discovery（只看 name + description）→ Activation（加载完整 SKILL.md）→ Execution（按需使用 scripts/references）。

## 四种 Skill 类型

### Standard（标准）

无论执行什么任务都适用的底层规则和规范。不指向任何具体任务，是模型行为的常驻约束。

类比：厨房卫生规范——无论做什么菜都要遵守。

**核心特征**：
- 不包含"请执行 X"这样的任务指令
- 是一组并行生效的约束/准则
- 通常应该始终激活（auto），甚至可以考虑并入 system prompt

**与系统的关系**：约束模型在使用 write/edit/act 时的行为——写什么样的代码、如何操作 git、如何处理错误。不编排工具使用顺序，不定义 progress 格式。

**典型代表**：coding（编码实践）、git（工作流规范）

### Task（任务）

指向一个具体任务的完整 SOP。Skill 中包含了"模型需要做什么"的指令本身，以及执行该任务的标准化流程。

类比：一道菜的食谱——任务是"做这道菜"，SOP 是步骤 1 到 N。

**核心特征**：
- 包含明确的任务定义（修 bug、重构、审查代码、清理磁盘、生成 PRD...）
- 有步骤序列，有退出条件
- 有明确的起点和终点（任务完成即结束）
- 将重复出现的任务抽取为可复用的标准化流程

**与系统的关系**：编排 observe/reason/act 三个工具的使用顺序。每个步骤天然映射到某种工具类型。每个步骤的退出条件对应一个 `progress(working)` 报告。

**典型代表**：bugfix（修 bug）、refactor（重构）、review（代码审查）、disk-cleanup（清理磁盘）、triage（分诊 issue）、to-prd（生成 PRD）、handoff（生成交接文档）

### Directive（指令）

改变模型的交互行为模式。不定义"做什么任务"，而是定义"怎么沟通、怎么呈现、怎么约束自身行为"。

类比：语气/节奏的调节器——同样一件事，可以快速做也可以一步一步展示过程。

**核心特征**：
- 不关心具体任务领域
- 改变的是汇报频率、推理呈现方式、输出风格、行动边界
- 可以与任何 task 堆叠使用

**两个子方向**：
- **Progress 调制器**：改变 progress 的使用频率和内容格式（research、step）
- **视角/模式调制器**：改变模型的输出视角或交互角色（zoom-out 上升抽象层、grill-me 反转为提问者）

**与系统的关系**：调制 progress 的频率和格式，或约束 observe/reason/act 的使用范围。

**典型代表**：research（高频汇报+证据链条）、step（通用高频汇报）、zoom-out（上升抽象层）、grill-me（穷举式提问）

### Capability（能力扩展）

赋予模型使用特定工具、API 或外部系统的操作能力。

类比：给厨师一把新刀——不是教做菜方法，是增加可用的器具。

**核心特征**：
- 包含具体的命令/代码模板
- 教模型如何通过 observe/act 操作特定系统
- 通常包含 scripts/ 目录中的可执行代码
- 附带的参考信息（参数表、避坑指南）服务于该能力本身

**与系统的关系**：扩展 observe 和 act 两个工具的操作范围。

**典型代表**：ssh-remote（远程服务器操作）、ppio-web-search（网页搜索）、everything-cli（文件搜索）、annotation（批注读写）

## 混合类型

一个 skill 可以包含多种类型的内容。标注时列出所有包含的类型，主要类型在前。

例：disk-cleanup 作为 task 时包含清理 SOP，同时内嵌了 capability 内容（Bun Shell 避坑指南）和参考知识（NVIDIA 驱动目录）。

## Standard 与 System Prompt 的关系

Standard 类型的 skill 和 system prompt 在功能上有重叠——都是"不论做什么任务都适用的规则"。区别在于：

| | System Prompt | Standard Skill |
|---|---|---|
| 加载方式 | 始终存在 | 按需激活（虽然通常建议 auto） |
| 内容性质 | 系统架构约束、工具定义、安全边界 | 编码实践、工作流规范 |
| 变更频率 | 低（动系统基础设施） | 高（迭代做事方法） |
| 迭代方式 | 需改 system prompt 代码 | 改 SKILL.md 文件 |

将频繁迭代的规范放在 skill 中而非 system prompt 中，可以加快迭代速度。

## Skill 堆叠规则

- Directive + Task 可以堆叠（例：@step + @bugfix）
- 多个 Directive 可以堆叠（例：@step + @zoom-out）
- 多个 Task 通常不堆叠（同时执行两个任务的 SOP 会冲突）
- Standard 和 Capability 可以与任何类型堆叠
- Directive 不能覆盖 system prompt 的安全约束
