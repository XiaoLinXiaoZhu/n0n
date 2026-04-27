# 想法：通过角色转换将 Agent 循环重构为显式状态机

> 状态：初始构想，待讨论
> 日期：2025-07-15
> 灵感来源：从世界模型讨论 → 图像编辑架构 → agent 工程的类比链

## 一、核心机制

### 传统 Agent 循环

```
system | user | assistant(思考+推理) | toolcall | toolresult | assistant(继续) | toolcall | toolresult | assistant(继续) ...
```

上下文是一条不断增长的叙事流，混杂着探索、行动、结果、反思。状态信息散布在整个序列中，模型需要从这堆文本中自行"拼凑"出当前局面。

### 角色转换方案

每次 assistant 的探索（思考 + 工具调用 + 工具结果）完成后，由一个 Transform 模块将整个探索过程折叠为一条 user 消息，追加到上下文中。然后 LLM 从这个更新后的上下文重新开始生成。

```
循环开始 →
  上下文: system | user₁ | user₂ | ... | userₙ
  LLM 生成: assistant + toolcall
  系统执行工具: → toolresult
  Transform(assistant, toolcall, toolresult) → userₙ₊₁
  上下文变为: system | user₁ | user₂ | ... | userₙ | userₙ₊₁
→ 循环继续，或 LLM 生成最终 assistant 回复
```

## 二、本质：在 Agent 框架中引入显式状态表示

这不是格式优化。它把 agent 循环重构成了一个状态机。

| 状态机组件 | 对应 |
|-----------|------|
| 状态 s | 累积的 user 消息序列 |
| 动作 a | assistant 输出（含 toolcall）|
| 观测 o | toolresult |
| 状态转移 T(s, a, o) → s' | Transform：将探索过程折叠为新的 user 消息，追加到状态 |
| 策略 π(s) → a | LLM：给定 user 消息序列，生成 assistant 回复 |

我们在之前的讨论中反复提到：LLM 缺少独立于文本流的状态表示。这个方案用 user 消息序列充当那个"状态板"——而且它恰好住在 LLM 最擅长处理的位置。

## 三、一个完整的例子

任务：用户说"我的 server.py 启动报错 port already in use"。

### 探索轮次 1

LLM 看到的上下文：
```
system: 你是编程助手
user: 我的 server.py 启动报错 "port already in use"
```

LLM 生成：
```
assistant: 让我查一下端口占用情况。
toolcall: exec("lsof -i :8080")
```

工具返回：
```
toolresult: COMMAND PID USER FD TYPE ... 
            python3 12847 dev 3u IPv4 ... *:8080 (LISTEN)
            python3 12847 dev 5u IPv4 ... localhost:8080->localhost:52431 (ESTABLISHED)
```

Transform 输出：
```
user: 端口 8080 被 PID 12847 的 python3 进程占用，状态 LISTEN，有 1 个活跃连接。
```

### 探索轮次 2

LLM 看到的上下文：
```
system: 你是编程助手
user: 我的 server.py 启动报错 "port already in use"
user: 端口 8080 被 PID 12847 的 python3 进程占用，状态 LISTEN，有 1 个活跃连接。
```

LLM 生成：
```
assistant: 需要关闭这个进程。
toolcall: exec("kill 12847")
```

工具返回：
```
toolresult: (空，执行成功)
```

Transform 输出：
```
user: 已执行 kill 12847，进程已终止。
```

### 最终回复

LLM 看到的上下文：
```
system: 你是编程助手
user: 我的 server.py 启动报错 "port already in use"
user: 端口 8080 被 PID 12847 的 python3 进程占用，状态 LISTEN，有 1 个活跃连接。
user: 已执行 kill 12847，进程已终止。
```

LLM 生成最终回复：
```
assistant: 问题已解决。之前有一个 python3 进程（PID 12847）占用了 8080 端口，
           已经帮你终止了。现在可以重新启动 server.py。
```

## 四、为什么状态住在 user 消息里是对的

### 4.1 LLM 是一个在 user→assistant 映射上训练的函数

LLM 的预训练和微调，本质上都是在学一个函数：给定 user 上下文，生成 assistant 回复。user 消息是输入空间，assistant 是输出空间。这是 LLM 见过最多、学得最好的映射。

把状态放在 user 消息中，意味着我们在用 LLM 最强的能力通道来读取状态。把状态放在 assistant 的历史回复中（传统方式），模型需要从自己之前的输出中反向提取信息——这不是它被训练来做的主要任务。

### 4.2 assistant 成为无状态的策略函数

传统方式中，assistant 既是"记忆者"（它之前的输出构成了上下文的一部分，承载着状态信息），又是"决策者"（它需要基于当前状态做出行动）。

新方式中，assistant 只需要做决策。所有状态信息已经被整理好放在 user 消息序列中了。每次生成都是一次干净的 state → action 映射，没有历史包袱。

### 4.3 状态是可编辑、可压缩、可重写的

在传统方式中，assistant 说过的话就是既定事实——即使其中大部分是无用的中间推理。你不能回去改它（自回归的单向承诺问题）。

新方式中，状态住在 user 消息里。Transform 每次都在生产新的 user 消息，而且理论上可以重写之前的 user 消息（压缩多条为一条、更新过时的信息、删除不再相关的内容）。状态板是活的，不是只追加的日志。

## 五、与我们之前讨论的全部串联

### 5.1 世界模型

我们说世界模型需要：维护状态 + 状态转移函数。这个方案给了 agent 一个显式的状态（user 消息序列）和显式的状态转移函数（Transform）。虽然状态仍然在 token 空间（不是 JEPA 那种表示空间），但它至少是**独立维护的**——不再和 assistant 的推理过程混在一起。

### 5.2 base+diff vs old mode & new mode

传统 agent 是 base+diff 模式：每轮在上下文末尾追加新内容，理解当前状态需要回溯整个历史。

新方案更接近 old mode & new mode：Transform 可以在折叠时做信息整合，每条 user 消息就是一个快照级别的状态描述。模型不需要回溯历史来理解"现在是什么情况"——最近的几条 user 消息就是当前状态。

### 5.3 图像编辑的类比

Qwen-Image 的编辑流程：原图（状态） + 指令 → 新图（新状态）。中间的扩散过程（探索）不保留在最终输出中——你只拿到编辑后的图。

新 agent 方案的逻辑完全一样：当前 user 上下文（状态） + LLM 探索 → 新的 user 消息（新状态）。中间的 assistant 推理和工具调用（探索过程）不保留——你只拿到精炼后的状态更新。

### 5.4 可训练的 harness

Transform 就是那个"可训练的 harness"。如果用 RL 训练它，优化目标是最终任务完成率，那它会自动学会：
- 什么信息该保留、什么该丢弃
- 什么粒度的状态描述让 LLM 后续表现最好
- 什么时候该压缩之前的 user 消息
- 怎么措辞让 LLM 最准确地理解当前局面

## 六、开放问题

### Transform 的设计

Transform 需要做一件不简单的事：把一段可能很长的"assistant 推理 + 工具调用 + 原始返回"压缩为一条简洁但不丢关键信息的 user 消息。这本身就需要理解能力。用什么来实现？

- 主 LLM 自身（加一个特殊 prompt，让它自己总结）
- 一个专门训练的小模型
- 两者混合：小模型做初步提取，主 LLM 做精炼

### 探索的广度 vs 状态的简洁

一次探索可能涉及多个工具调用、多次试错。Transform 需要把这一切压缩成一条消息。压缩得太狠会丢信息，太松会失去方案的优势。这个 trade-off 如何自动调节？

### 多步探索中的"不确定性"如何传递

有时候一次探索的结果是不确定的（"可能是 A 导致的，也可能是 B"）。Transform 产出的 user 消息需要表达这种不确定性，而不是强行给出一个确定的结论。否则模型会基于错误的确定性做后续决策。

### 与现有 LLM API 的兼容性

现有的 LLM API（OpenAI、Anthropic 等）对 user/assistant 消息的交替有一定要求（通常要求 user 和 assistant 交替出现）。连续多条 user 消息在某些 API 下可能需要合并处理。

### 回溯能力

如果 LLM 在后续探索中发现之前的 user 消息（即之前的 Transform 输出）有误，如何修正？需要一种机制让 Transform 能回头更新之前的状态条目，而不只是追加新的。
