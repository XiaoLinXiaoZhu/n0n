# prototype (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto

## A. 类型组成

**Methodology**（主要）。两分支的原型构建流程，附带 2 个 reference 文件分别定义逻辑原型和 UI 原型的具体规则。

## B. 作用与核心思想

构建一次性原型来回答设计问题。先判断问题类型，再走对应分支：
- **"这个逻辑/状态模型对不对？"** → LOGIC.md 分支：构建可交互的终端应用，推动状态机跑各种 case
- **"这个应该长什么样？"** → UI.md 分支：生成多个截然不同的 UI 变体，通过 URL 参数切换

5 条通用规则：
1. 一开始就标记为 throwaway
2. 一条命令可运行
3. 不持久化
4. 跳过测试和错误处理
5. 每次操作后显示完整状态

核心思想：**原型的价值不在代码，而在回答的问题**。完成后保留的是答案（写入 commit message/ADR/NOTES.md），不是代码。

## C. 与执行工具和 progress 的结合潜力

**中等潜力**。原型构建过程可以映射：
- 判断分支 → reason（分析问题类型）→ progress(working)（"问题是逻辑类型，走 LOGIC 分支"）
- 构建原型 → write + act（写代码 + 运行验证）
- 用户测试 → progress(blocked)（"原型已就绪，请运行 X 命令测试并告知结论"）
- 记录结论 → write（ADR 或 NOTES.md）→ progress(completed)

**值得借鉴的内容**："原型是 throwaway 的"这个硬约束——防止原型代码污染生产代码。

## 人类评价

这个属于无副作用 task 类型的，感觉可以试试看。

## AI 回应

确认归为 **Task**。"无副作用"的观察很精确——prototype 的产出是一次性代码（标记为 throwaway），不影响生产代码库。

这种"探索性 task"的特点：执行后的有价值产出不是代码，而是回答了一个设计问题。答案记录在 ADR/NOTES.md 中。