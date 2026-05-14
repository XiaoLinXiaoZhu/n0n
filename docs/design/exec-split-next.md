# exec 拆分：进一步深化方向

## 前提

当前实现中，observe / reason / act 三个工具共享完全相同的参数（script, runtime, cwd, waitfor），区分仅靠工具名和 description。这种设计的优点是实现简单、切换成本低，但也意味着围栏信号仅来自名称层面。

本文档讨论如何在参数、description、结果呈现等维度进一步强化围栏效果。

---

## 方向一：参数差异化

### observe 和 reason 不需要 waitfor

observe 和 reason 被定义为无副作用的操作。它们的典型用途（读文件、搜索代码、运行计算脚本）通常不需要长时间等待或后台运行。

建议：observe 和 reason 移除 waitfor 参数（或设置更短的默认值和上限）。

效果：参数集合本身成为围栏信号的一部分——模型看到 observe 没有 waitfor，会强化"这是一个轻量的、快速的读操作"的认知。如果模型试图用 observe 做需要长时间等待的事情，参数限制会自然地将它推向 act。

风险：某些观察操作确实需要等待（比如读取大文件、复杂的 rg 搜索），移除 waitfor 可能导致超时。可以考虑保留但缩短上限（比如 observe 的 waitfor 上限 60s，act 保持 240s）。

### reason 的 script 参数重命名

reason 的用途是"将思考物化为可执行代码"。但参数名 `script` 暗示的是"要执行的脚本"——这是 exec 时代的遗留语义，和 reason 的角色不匹配。

候选名称：
- `script`（保持不变）：优点是和 observe/act 一致，模型不需要学习新参数名。缺点是语义不精确。
- `code`：比 script 稍好，但也是偏执行的语义。
- `analysis` / `computation`：语义精确，但作为参数名太长，且和实际内容（可以是任何代码）不完全匹配。

**建议保持 `script` 不变。** 参数名的围栏效应远弱于工具名——模型对参数名的注意力权重低于对工具名的注意力权重。改参数名带来的认知收益小于不一致带来的认知成本。围栏信号应集中在工具名和 description 上。

### act 增加 confirm 语义

当前 act 的 description 说"execute actions that change environment state"，系统提示词也要求"consider reversibility before acting"。但这个约束只存在于语义层。

讨论：是否给 act 增加一个可选的 `intent` 参数？模型在调用 act 时必须用一句话声明"我要做什么、为什么"。

```json
{
  "name": "act",
  "script": "git add . && git commit -m \"fix: resolve race condition\"",
  "intent": "提交竞态条件的修复，已通过测试验证"
}
```

效果：intent 参数迫使模型在写 script 之前先声明意图——这是一种生成时围栏，和 observe/reason/act 的工具名选择是同一个机制（先声明角色，再写内容）。而且 intent 会出现在对话历史中，帮助后续轮次理解这次 act 的目的。

风险：增加了参数填写负担。模型可能写出泛泛的 intent（"执行操作"），导致参数形同虚设。需要在 description 或提示词中明确 intent 的要求。

---

## 方向二：description 的语用信号强化

当前三个工具的 description：

| 工具 | description |
|------|-------------|
| observe | Read files, search code, or check environment state. No side effects — use this for gathering information only. |
| reason | Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user. |
| act | Execute actions that change environment state: run tests, build, commit, install dependencies, etc. |

### observe：强调"输出是信息，不是结果"

当前 description 告诉模型"做什么"（读文件、搜索代码），但没有强调模型应该如何对待输出。可以补充：输出是待分析的原始信息，不是任务成果。

### reason：强调"输出仅供自己消费"

当前已经说了"output is for the model's own consumption, not presented to the user"——这是很好的围栏信号。它告诉模型：这个工具的输出不会被用户看到，所以不需要格式化、不需要解释、不需要客气。

可以进一步强化：明确说 reason 的输出不会影响外部状态，模型可以放心地在其中做假设、推翻、重来。

### act：强调不可逆性

当前只列举了典型操作。可以在 description 中直接嵌入谨慎信号：

```
Execute actions that change environment state: run tests, build, commit, 
install dependencies, etc. Actions may be irreversible — verify your 
reasoning (via reason) before acting.
```

"verify your reasoning (via reason) before acting" 直接在 description 中建立了 reason → act 的前置关系，强化认知循环。

---

## 方向三：tool_result 的差异化

当前 ROADMAP 记录："tool_result 格式化——不变（result.tool 始终为 "exec"）"。这意味着模型在读取工具结果时，看不到这个结果来自 observe 还是 act。

建议：tool_result 中回传实际工具名。

```
[observe result] stdout: ...
[act result] stdout: ...
```

效果：围栏标记不仅出现在调用侧（模型写），也出现在结果侧（模型读）。模型在处理 observe 的结果时会以"信息收集"的态度解读，处理 act 的结果时会以"验证执行结果"的态度解读。

这和 progress 的设计一致：working 的内容是推理日志（可审计、可纠正），completed 的内容是最终交付物（自包含、正式）——状态标记改变了内容的语用角色。tool_result 如果也携带工具名，就为结果内容创造了语用围栏。

实现成本很低——result 格式化时已有 tool 字段，改为使用实际调用的工具名即可。

---

## 方向四：围栏的可验证性

在 `从模型注意力理解模型行为` 文章中使用了 QwenScope 分析注意力分布。同样的方法可以用于验证 exec 拆分的效果：

1. 对比 unified 和 split 模式下，模型处理同一对话历史时的注意力分布
2. 检查 observe/reason/act 标记处是否形成了注意力节点
3. 检查同类工具调用之间的注意力连接是否强于异类

这可以把围栏效应从"经验观察"推进到"可量化验证"。

---

## 优先级建议

| 方向 | 收益 | 成本 | 建议 |
|------|------|------|------|
| tool_result 回传工具名 | 高（补全围栏闭环） | 极低 | 立即做 |
| act description 加谨慎信号 | 中（强化 reason→act 循环） | 极低 | 随下次迭代一起 |
| observe/reason 缩短 waitfor 上限 | 中（参数层围栏信号） | 低 | 先统计实际超时情况再定 |
| act 增加 intent 参数 | 不确定 | 中 | 小范围实验后决定 |
| reason 改参数名 | 低（工具名已足够） | 低 | 暂不做 |
| QwenScope 验证实验 | 高（量化围栏效应） | 中 | 有空时做，结果可反哺所有围栏设计 |