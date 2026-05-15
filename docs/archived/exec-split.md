# exec 拆分：observe / reason / act

> 从 `ROADMAP.md` 移出存档。此重构已全部完成，留作历史记录。

**状态**：已完成，正式化

---

## 背景

原 `exec` 工具承担了多种认知角色（观察、推理、执行），已正式拆分为三个语义独立工具：

- `observe` — 无副作用的读取/检查/搜索操作
- `reason` — 物化思考，将推理过程编码为可执行代码
- `act` — 有副作用的变更操作（测试、构建、git）

## 架构决策

- 三工具共享同一执行后端 `execToolStream`，通过 `tool` 字段区分
- 参数类型统一为 `ExecArgs`（Zod schema），零重复定义
- 类型系统通过 `ToolMap` 注册表自动窄化
- 渲染层根据 `result.tool` 呈现不同围栏颜色和摘要格式
- 工具顺序：`progress → observe → reason → act → write → edit`（优先级信号）

## 移除内容

实验阶段的 `EXEC_MODE=split` 切换机制、`execMode` 配置字段、fewshot tool name 重映射逻辑已全部清理。`observe/reason/act` 为唯一工具形态。
