# Topic: 工具使用详则

## 来源

code.md "# Using your tools" 节。将产出 init skill: `tool-usage`（order: 20）。

## 当前内容逐条梳理

### 1. system-hint 说明

> 工具结果可能包含 `<system-hint>`，是运行时的临时建议。评估是否适用后再行动。

运行时机制说明，直接保留。

### 2. 工具偏好

- write/edit 优先做文件操作
- rg 优先于 grep
- 脚本内处理输出，不 dump 大段原始输出
- bun 做复杂数据处理
- 简单命令用默认 shell
- 第三方库隔离安装

这些是"怎么选择工具"的实操建议。无争议。

### 3. progress 三种状态

- completed：任务完成，详尽报告
- working：进行中，暴露决策点
- blocked：需要用户决策，自包含 + 选项 DSL

这是 progress 工具的核心定义。当前内容比较长（~15行），定义了每种状态的格式要求。

与 interaction-protocol topic 有关联——research/step directive 在此基础上进一步调制 progress 的使用频率和内容格式。tool-usage 定义"progress 是什么、基本格式"，directive 定义"progress 的使用节奏"。

### 4. observe / reason / act 详细说明

每个工具的定义 + 示例 + 关键原则（批量调用、安全性、确定性工具不等待）。

这部分比较长（~30行），是工具使用的核心参考。

### 5. 批量调用原则

> progress 可以与其他工具同批发出。reporting progress is valuable, not wasteful。

与效率要求相关，直接保留。

## 与 interaction-protocol 的关系

tool-usage 定义工具的"是什么"和"基本用法"。interaction-protocol 中讨论的 directive（research/step 等）定义"在什么节奏下使用 progress"。两者不冲突——tool-usage 是基础层，directive 是调制层。

## 待讨论

- [拆分为show-usage] progress 的详细格式说明放 tool-usage（基础定义）还是单独成为一个 init skill？
- [拆分为三个init-skill，也就是说三个skill：progress、observe/reason/act、write&edit] observe/reason/act 的示例是否需要缩减（空壳中已有最简定义）？
