# grill-me (mattpocock)

> 来源：mattpocock/skills/productivity | 激活：auto

## A. 类型组成

**Directive**（纯粹，交互调制器）。改变模型的交互模式为穷举式提问。

## B. 作用与核心思想

完整内容极短：

> Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.
> Ask the questions one at a time.
> If a question can be answered by exploring the codebase, explore the codebase instead.

核心行为：
1. **穷举式提问**——遍历设计树的每个分支
2. **带推荐答案**——不只问问题，还给出模型的推荐
3. **一次一个问题**——不一次性抛出所有问题
4. **能查代码就不问**——优先自己探索

核心思想：**反转角色——模型提问，用户回答**。常规交互中模型是被问方，grill-me 让模型变成面试官。这迫使用户具体化自己的想法，暴露模糊的地方。

与 grill-with-docs 的关系：grill-me 是纯提问，grill-with-docs 是提问 + 文档维护。grill-me 更轻量，适用于非代码场景。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。grill-me 是对话式 skill，当前没有使用工具或 progress。

如果整合进我们的系统，每个问题可以映射为 progress(blocked)——呈现问题和推荐答案，等用户回答。但这取决于交互节奏：如果用户想要快速一问一答，progress(blocked) 的"提交后等待"模式可能太慢。

"能查代码就不问"这条规则天然需要 observe 工具。

## 人类评价

我感觉这一套理念很好，但是因为我们有blocked，所以说一次性用progress(blocked)询问可能会更好。

只有当前后问题有依赖关系时，才应该拆分开来。

## AI 回应

同意用 progress(blocked) 一次性呈现问题组。

具体设计：模型先用 observe 探索代码库（能自己回答的不问），收集所有需要用户回答的问题，然后用一个 progress(blocked) 呈现问题列表 + 每个问题的推荐答案。只有存在依赖关系的问题（B 的答案取决于 A 的答案）才拆分为多个 blocked。

这比"一次一个问题"高效得多——减少了用户等待的轮次。

分类确认：grill-me 归为 **Directive**。