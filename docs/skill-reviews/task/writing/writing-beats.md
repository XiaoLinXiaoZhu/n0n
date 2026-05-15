# writing-beats (mattpocock, in-progress)

> 来源：mattpocock/skills/in-progress | 激活：auto

## A. 类型组成

**Methodology**（主要）+ **Directive**（次要，交互调制器）。beat-by-beat 的文章写作流程。

## B. 作用与核心思想

将文章写作从"一次性产出"变为"逐 beat 推进的交互式旅程"。

循环流程：
1. 从原始素材中写出 2-3 个候选起始 beat，用户选一个
2. 只写被选中的那个 beat 到文章文件
3. 重新读取文章文件，提供 2-3 个候选下一步 beat
4. 循环直到文章自然结束

beat 的定义：一个 move——设定场景、落点、提问、插曲、转向。大小由需要决定（可以是一句话，也可以是几段）。如果一个"beat"需要五段和三个小标题，那不是一个 beat 而是两个粘在一起了。

核心思想：**让用户在每个转折点参与选择方向**，而不是模型独自完成整篇文章。这是 annotation-interaction-paradigm.md 中讨论的"让人从被动验收者变为主动操作者"的写作领域实现。

## C. 与执行工具和 progress 的结合潜力

**高潜力**。beat 循环天然映射 progress：
- 呈现候选 beat → progress(blocked)（2-3 个选项）
- 写入选中的 beat → write
- 循环中的每次写入 → progress(working)（"beat 3 已写入，主题是 X"）

这是 directive + methodology 混合的一个好示例——writing-beats 既定义了步骤（methodology），也改变了交互模式（directive：一次只一个 beat，用户选方向）。

**值得借鉴的内容**：增量式交互产出模式——不一次性生成，而是每步让用户选择方向。这个模式不局限于写作，可以用于任何"模型产出 + 用户审阅 + 继续"的场景。

## 人类评价

这个属于 协作领域的指导了。可以学习参考一下

## AI 回应

同意。writing-beats 是协作领域的 **Task**——任务是"逐 beat 写文章"，SOP 定义了增量式交互产出的循环。

"增量式交互产出"模式（模型产出候选 → 用户选方向 → 继续）在代码之外的协作场景中很有价值，可以作为设计其他协作 task 的参考模板。