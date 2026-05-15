# research

> 来源：user skill | 激活：manual

## A. 类型组成

**Directive**（主要，progress 调制器）。定义研究型任务的交互协议，不定义研究方法论本身。

## B. 作用与核心思想

约束模型在执行研究任务时的沟通节奏和推理呈现方式。

四个核心约束：
1. **基于证据，不基于直觉**——每一步声明必须有具体依据（文件名、行号、数值），用 reason 运行思维实验验证假设
2. **极高频 progress(working)**——每个独立的推理步骤（提出假设、检查证据、排除/确认、转向）都声明
3. **progress(blocked) 请求人类审阅**——产出需要人类判断的文档时，必须请求审阅，附自信程度和决策点
4. **投入足够工作量后才推进**——两个 blocked 之间必须有若干个 working，禁止偷懒式提问

核心思想：**让模型的推理过程对用户透明可追踪**。不是教模型"怎么研究"，而是教模型"怎么展示研究过程"。

## C. 与执行工具和 progress 的结合潜力

**天然深度结合**。research skill 的全部内容就是在定义 progress 工具的使用模式。

- 约束一（证据链条）→ 约束 reason 工具的使用方式
- 约束二（高频 working）→ 直接调制 progress(working) 的频率和格式
- 约束三（blocked 审阅）→ 直接定义 progress(blocked) 的触发条件和内容格式
- 约束四（工作量门槛）→ 约束 working 和 blocked 之间的最小工作量

还定义了与 bugfix skill 的协作模式：research 负责探索和归因阶段，bugfix 负责修复阶段。这是 skill 堆叠的良好示例。

## 人类评价

这类skill实际设计的原则很简单，就是在和模型的交互中总结出在某个特定子项中的badcase和goodcase，

然后通过一些规则，将这些badcase给根本性、结构性的避免掉，然后尽可能发扬goodcase。

## AI 回应

精确概括了 directive skill 的设计方法论。research 的四个约束确实都是从实际交互中的 badcase 反推出来的：

- badcase：模型说"这个函数看起来有问题" → 约束一（必须有具体依据）
- badcase：模型一口气干完再汇报 → 约束二（高频 working）
- badcase：模型偷懒式提问"这个很复杂你看怎么办" → 约束四（工作量门槛）

这个"badcase→硬规则"的设计方法可以推广：**写任何 directive skill 的第一步应该是列举 badcase 清单**，然后为每个 badcase 设计一条结构性的约束。

分类确认：research 归为 **Directive**。
