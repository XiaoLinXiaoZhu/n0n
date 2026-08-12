# Exec 输出预算与 execution artifact 读取策略

## 状态

已实现。

本次变更重新划分了三类原本混在一起的问题：

- 命令结果进入模型上下文时的传输预算
- 在大型项目中发现文件和候选位置
- 对已经产生的大型输出进行后续分析

这些问题不再统一交给 cursor 驱动的文本读取器处理。

## 问题

原有设计在 exec 输出超过固定阈值后保存完整输出，并要求模型使用 `n0n read` 按 cursor 顺序读取。这产生了几个结构性摩擦：

1. 下一次调用依赖上一次返回的 cursor，完整读取需要多轮模型交互。
2. 模型无法在同一响应中批量请求多个已经确定的独立范围。
3. `rg` 对未知大型项目进行发现是合理操作，“目标未知”并不意味着应该从某个文件开头顺序读取。
4. 略高于固定阈值的有价值结果也会被截断，模型无法主动为单次调用申请更大的返回预算。
5. 对有副作用的命令重新执行以获得完整输出并不安全。

根本问题不是 cursor 的接口形式，而是将输出传输、项目搜索和 artifact 分析错误地建模成了同一种读取行为。

## 最终契约

### `output_tokens`

`observe`、`reason` 和 `act` 共享可选参数：

```text
output_tokens?: number
```

它表示本次 stdout 与 stderr 合计允许进入下一轮模型上下文的预估 token 数。

- 默认值：5000
- 配置上限：`settings.agent.max_exec_output_tokens`
- 默认上限：32000
- 超过配置上限时在工具参数校验边界返回错误，不静默修正

该参数只限制最终工具结果进入模型上下文的文本，不限制：

- 进程实际产生的输出
- execution artifact 中保存的完整内容
- 终端上的实时流式展示

### 截断结果

当输出不超过预算时，stdout/stderr 完整返回，临时 artifact 被删除。

当输出超过预算时：

- 完整 stdout/stderr 保存在 execution artifact。
- 返回内容在总预算内按 stdout/stderr 规模分配。
- 每个流返回头尾预览，而不是只返回尾部。
- 省略标记本身计入 token 预算。
- 工具结果和 `result.json` 记录字节数、行数及预估 token 数。

token 数是增量估算值，因此字段明确使用 `EstimatedTokens` 命名。执行器不会为了统计而在命令完成后再次完整扫描 artifact。

### execution artifact

artifact 继续使用分离文件：

```text
stdout.txt
stderr.txt
result.json
```

对于昂贵、非幂等或有副作用的命令，输出截断后必须读取 artifact，不得仅为获得更多输出而重新执行命令。

对于廉价且只读的命令，可以根据实际估算规模选择：

- 使用更大的 `output_tokens` 重新执行
- 从 artifact 提取所需内容
- 使用 `rg`、`jq` 或脚本预处理结果

## 删除 `n0n read`

`n0n read` package、CLI 子命令和 cursor 契约已全部删除，不提供兼容包装。

删除原因：

- `output_tokens` 已覆盖“需要一次获得更完整结果”的需求。
- execution artifact 已覆盖“不能安全重跑命令”的需求。
- `rg`、`fd`、`jq` 和脚本更适合项目发现及结构化提取。
- 标准范围命令可以处理明确范围，并允许模型在同一响应中批量发出互不依赖的调用。
- 保留专用读取器会形成第二套重叠的输出预算和导航系统。

## 模型指导规则

`data/skills/self-function` 中的规则按操作意图划分：

1. 大型项目中发现候选位置：使用 `rg`、`fd` 等搜索工具。
2. 已知模式或结构：使用 `rg`、`jq`、数据库查询或脚本提取。
3. 确实需要完整且规模可控的结果：提高 `output_tokens`。
4. 已有昂贵或非幂等执行结果：读取 execution artifact。
5. 已知多个独立范围：可以在同一模型响应中批量调用；执行器仍可能根据冲突策略顺序执行。

不再使用“目标已知/未知”作为选择 `rg` 或顺序读取的二元判据。

## 兼容性边界

- 不保留 `n0n read` 的命令兼容逻辑。
- 不引入旧 execution artifact 格式的领域联合类型。
- conversation log 保持严格 version 2；version 1 在加载边界被拒绝，不进入核心领域模型。

## 验证

实现完成后执行：

- `bun run tsgo --noEmit`
- `bun test`
- `bun run biome check --fix`
- `git diff --check`

全量测试结果为 306 项通过、6 项外部服务测试跳过、0 项失败。
