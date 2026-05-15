# Topic: 交互协议

## 讨论来源

- research (user) — 研究型任务交互协议
- step (user) — 通用高频汇报
- zoom-out (mattpocock) — 上升抽象层
- grill-me (mattpocock) — 穷举式提问

## Directive 的设计方法论

### 讨论

**人类**：这类 skill 实际设计的原则很简单，就是在和模型的交互中总结出 badcase 和 goodcase，然后通过规则将 badcase 给根本性、结构性的避免掉。

**AI**：精确概括。示例：
- badcase：模型说"这个函数看起来有问题" → 约束（必须有具体依据）
- badcase：模型一口气干完再汇报 → 约束（高频 working）
- badcase：模型偷懒式提问 → 约束（工作量门槛）

推广原则：**写任何 directive 的第一步应该是列举 badcase 清单**。

## step 的存在理由

**人类**：加 step 主要是因为系统提示词对于使用 progress step by step 约束还是太弱了。

**AI**：step 本质上是 system prompt 的"补丁"。长期方向：将核心约束合并进 system prompt，step 作为"加强版"。

## zoom-out 扩展：XY 问题与第一性原则

**人类**：模型经常陷入 A→B→C 的局部纠结。需要让模型跳脱出来。除了"上升抽象层"，还应该：
- 回顾问题本身，思考是否走入了 XY 问题的陷阱
- 使用第一性原则重新分析和定义问题

**AI**：zoom-out 可以扩展为三个视角：
1. 上升抽象层（画模块地图）
2. XY 问题检查（回顾问题链）
3. 第一性原则（剥离假设，从根本需求重新推导）

## grill-me 与 progress(blocked)

**人类**：因为我们有 blocked，所以一次性用 progress(blocked) 询问可能会更好。只有前后问题有依赖关系时才拆分。

**AI**：同意。具体设计：先 observe 探索（能自己回答的不问），收集所有需要用户回答的问题，一个 blocked 呈现问题列表 + 推荐答案。

## 待决事项

- [可以拓展，而且建议改为中文版本，应该说所有的提示词都应该改为中文版本。] zoom-out 是否扩展为三视角版本
- [step作为一个init-skill，重新组织，skill主题大概为progress-usage] step 的核心约束是否应合并进 system prompt
- [grill-me作为独立skill，因为频繁的盘问并非常见的对话场景，这里是作为开始任务前的初始化用的（类似plan-before-act）] grill-me 是否需要做成独立 skill，还是作为通用 blocked 使用模式
