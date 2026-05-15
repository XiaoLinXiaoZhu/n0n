# step

> 来源：user skill | 激活：manual

## A. 类型组成

**Directive**（主要，progress 调制器）。research 的泛化版本，适用于任何场景。

## B. 作用与核心思想

与 research 几乎完全相同的四个约束，但适用场景从"研究型任务"扩展为"任何任务"。

唯一的区别是：
- research 声明适用于"需要系统性探索和分析的任务"，不适用于"明确指令式任务"
- step 声明适用于"任何场景"

核心思想：**把 research 的高频汇报、证据链条、审阅流程作为通用交互协议**。

## C. 与执行工具和 progress 的结合潜力

与 research 完全相同。

**关于 step 与 research 的关系**：step 是 research 的超集。如果 step 存在，research 的独立存在价值在于它的"适用场景"声明更精确（帮助模型判断何时激活），以及它定义了与 bugfix 的协作模式。如果将来只保留一个，建议保留 research（更精确的适用范围 + 跨 skill 协作），让 step 的"任何场景"语义通过用户显式 @step 触发。

## 人类评价

加这个主要是因为系统提示词对于使用progress step by step 约束还是太弱了，于是做了这个，在交互的时候会更透明一点。

## AI 回应

理解了——step 的存在是因为 system prompt 对 progress 使用的约束太弱。这意味着 step 本质上是对 system prompt 的"补丁"。

两个可能的长期处理方向：
1. 将 step 的核心约束合并进 system prompt（让所有场景默认遵守）
2. 保持 step 作为 directive skill，但让它成为"加强版"——system prompt 给出基本的 progress 使用规范，@step 在此基础上要求更高频更详细

当前保持现状即可。

分类确认：step 归为 **Directive**。