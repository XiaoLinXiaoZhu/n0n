# write-a-skill (mattpocock)

> 来源：mattpocock/skills/productivity | 激活：auto

## A. 类型组成

**Methodology**（主要）。编写 skill 的标准流程和质量清单。

## B. 作用与核心思想

教模型如何编写一个好的 skill。

3 步流程：Gather requirements → Draft the skill → Review with user。

核心规则和质量标准：
1. **description 是唯一的发现信号**——模型只通过 description 决定是否加载，所以必须精确包含"做什么"和"什么时候触发"
2. **SKILL.md < 100 行**——超过就拆分到 reference 文件
3. **脚本用于确定性操作**——验证、格式化等重复性代码放 scripts/ 而不是每次生成
4. **reference 只一层深**——避免嵌套引用链

Review checklist：description 包含 triggers、SKILL.md 不超 100 行、无时间敏感信息、术语一致、有具体示例、引用只一层。

核心思想：**skill 是最小有效的指令集**。不是越详细越好，而是刚好足够让模型正确执行。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。skill 编写过程可以映射：
- Gather requirements → progress(blocked)（逐项询问用户需求）
- Draft → write（创建 SKILL.md 和 reference 文件）
- Review → progress(blocked)（呈现草案，请用户审阅）

**值得借鉴的内容**："SKILL.md < 100 行"这个标准值得参考。我们当前的 bugfix（~150行）超标，但因为包含 progress 格式模板，额外长度有合理性。未来写 skill 时应以此为参考上限。

## 人类评价

感觉并不需要，因为我们的exec有自动的 4k token 截断，所以说用行数衡量没什么意义。

这里的100行也只是建议而非必须。其他的建议感觉没什么问题。

## AI 回应

同意。100 行限制作为建议而非硬性约束。我们的 exec 有 4k token 截断，所以实际约束是 token 数而非行数。

write-a-skill 归为 **Task**（任务：编写一个 skill）。其核心价值在于 description 写法和 review checklist，这些建议本身不错。