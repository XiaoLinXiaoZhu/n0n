# zoom-out (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto（disable-model-invocation: true）

## A. 类型组成

**Directive**（纯粹，输出调制器）。一句话指令，改变模型的输出视角。

## B. 作用与核心思想

完整内容只有一句话："I don't know this area of code well. Go up a layer of abstraction. Give me a map of all the relevant modules and callers, using the project's domain glossary vocabulary."

这是最小的 skill 示例——证明 skill 不需要复杂的 SOP，一句话也能有效改变模型行为。

核心思想：**要求模型从当前细节视角上升一层**，给出模块地图和调用关系全景，而不是继续在局部代码中钻。

特殊标记 `disable-model-invocation: true` 表示模型不应自主激活此 skill，只能由用户显式触发。

## C. 与执行工具和 progress 的结合潜力

**弱结合**。zoom-out 触发的行为是 observe（遍历代码结构、搜索调用关系），然后输出一个全景地图。不需要 progress 追踪——它是一次性输出，不是多步流程。

**值得借鉴的内容**：作为极简 directive skill 的范例——证明 skill 的价值不在长度，而在精准改变模型行为的能力。

## 人类评价

模型经常在讨论中陷入局部问题的纠结中。比如从 A问题 到 B问题 到 C问题。

C 作为 B 的子问题，C 在某种错误的假设中被定义，实际上应该解决XY问题中的 X，而Y是错误的路径。

这个时候需要让模型跳脱出来，可能就需要使用这个。

就我个人而言，我还会让模型：
- 请你回顾问题本身，思考是否可能走入了 XY 问题的陷阱中
- 请你使用第一性原则重新分析和定义我们的问题

## AI 回应

你描述的场景（A→B→C，C 基于错误假设）正是 zoom-out 要解决的。

你提到的两个额外指令很有价值：
- "回顾问题本身，思考是否走入了 XY 问题的陷阱"
- "使用第一性原则重新分析和定义问题"

如果要做成 skill，可以将 zoom-out 从"一句话"扩展为包含这三个视角的 directive：
1. **上升抽象层**：画出模块地图和调用关系全景（mattpocock 原版）
2. **XY 问题检查**：回顾问题链，检查是否在解决错误的问题
3. **第一性原则**：剥离所有假设，从根本需求重新推导

三个视角不需要同时使用，但放在一个 skill 中让模型在需要"跳出来"时有多个工具可选。

分类确认：zoom-out 归为 **Directive**。