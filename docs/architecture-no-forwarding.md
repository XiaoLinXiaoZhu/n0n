# 架构指南：移除透传，保护模块边界

## 概述

透传（forwarding）是指一个函数接收参数，却不真正理解或消费这些参数，只是继续把它们传给下游。

典型形状：

```ts
function outer(input, resolver, confirmFn) {
	return inner(input, resolver, confirmFn);
}
```

如果 `outer` 不使用 `resolver` 或 `confirmFn`，它就不是一个真正的模块，而是下游实现的“人工管道”。随着调用链变长，参数会逐层扩散，最终导致：

- 接口参数越来越多；
- 本来不应该了解某个概念的函数被迫理解它；
- 修改一个依赖时需要修改许多无关调用方；
- 测试必须构造一整串与当前行为无关的 mock；
- 真正的接缝被隐藏在多层转发之后。

本指南的目标不是禁止参数传递，而是区分“有意义的适配”与“没有行为的搬运”。

## 三种情况

### 透传

函数不读取参数、不改变参数、不根据参数做判断，只把参数传给另一个函数。

```ts
function recoverAll(items, recover) {
	return recoverPartialCalls(items, recover);
}
```

如果 `recoverAll` 没有额外语义，它就是透传层。删除它不会让复杂度消失，只会让调用方直接调用 `recoverPartialCalls`。

### 半透传

函数读取了少量参数，但主要职责仍然是把下游所需的上下文继续搬运。

```ts
function runTool(call, confirmFn, getEntry) {
	const entry = getEntry(call.tool);
	return executeEntry(entry, call, confirmFn);
}
```

如果这个函数只负责查找并转发，而错误翻译、协议归一化和生命周期管理都在别处，它通常是半透传。

半透传比纯透传更危险，因为它看起来“做了事情”，但仍然把下游复杂度泄漏给调用方。

### 真正的适配器

函数在边界处完成了语义转换，调用方不需要理解下游协议。

```ts
async function* executeEntry(entry, call, confirmFn) {
	try {
		yield* entry.execute(call, confirmFn);
	} catch (err) {
		if (err instanceof ZodError) {
			yield invalidArgsError(call, entry, err);
			return;
		}
		throw err;
	}
}
```

这里的函数不是透传，因为它：

- 统一了工具执行协议；
- 把异常转换为领域事件；
- 隐藏了具体的执行器实现；
- 为调用方提供稳定的事件流。

它在接缝处提供了杠杆和局部性，因此值得保留。

## 透传为什么会使接口膨大

假设底层执行器需要三个依赖：

```ts
execute(call, resolver, confirmFn)
```

如果中间有三层透传，接口会变成：

```ts
loop(..., resolver, confirmFn)
round(..., resolver, confirmFn)
recover(..., resolver, confirmFn)
execute(call, resolver, confirmFn)
```

每一层都被迫知道 `resolver` 和 `confirmFn` 的存在，即使它们对这一层没有意义。

这会产生三个结构性问题。

### 接口膨胀

函数签名描述的不再是函数自身需要的知识，而是整条调用链中最底层实现需要的知识。

### 复杂度泄漏

上层模块开始了解工具查找、确认回调、恢复策略、协议模式等下游细节。模块之间的接缝因此变浅：接口几乎等于实现。

### 变更半径扩大

增加一个依赖不再只修改真正的消费者，而是修改所有中间层。一次局部变化变成全链路修改。

## 判断标准：参数是否被本模块消费

对每个参数逐一询问：

1. 本函数是否读取它？
2. 本函数是否根据它做分支？
3. 本函数是否改变它的语义或格式？
4. 本函数是否用它建立了更深的抽象？
5. 如果删除它，本函数的行为是否改变？

如果五个答案都是“否”，这个参数不应该出现在该函数接口中。

注意：闭包创建时使用依赖，与每次业务调用时透传依赖，是两种不同的结构。

```ts
// 透传：每次调用都搬运依赖
run(call, resolver, confirmFn);

// 绑定：在边界处一次性组装
const run = createRunner(resolver, confirmFn);
run(call);
```

第二种方式把依赖组装集中在接缝处，使业务函数只接收它真正消费的输入。

## 标准重构方法

### 1. 先画调用链

列出每个参数的传播路径：

```text
agentLoop
  → round
    → recovery
      → tool entry
```

标记每一层：

- `C`：真正消费（consume）
- `A`：做语义适配（adapt）
- `F`：纯透传（forward）

目标是删除 `F`，并让 `A` 尽可能靠近边界。

### 2. 在边界处绑定上下文

适合绑定的依赖包括：

- resolver / registry；
- confirm callback；
- workspace；
- provider 配置；
- 文件系统或进程运行器；
- 日志写入器。

绑定后返回只接受业务输入的函数：

```ts
const executeTool = createToolExecutor(toolkit, confirmFn);
const result = await executeTool(call);
```

### 3. 归一化协议差异

如果两种实现可以表达为同一种行为，应在注册边界归一化，而不是让调用方分支。

例如，非流式工具可以包装成一个只产生一次事件的异步生成器：

```ts
execute: async function* (call) {
	yield await writeTool(call);
}
```

这样调用方只需要理解一个协议：

```ts
yield* entry.execute(call, confirmFn);
```

不要让调用方理解：

```ts
entry.stream
	? yield* entry.execute(call)
	: yield await entry.execute(call);
```

### 4. 把错误翻译放在接缝

底层异常属于底层实现，领域错误属于领域层。应在真正的适配器处完成翻译：

```ts
try {
	yield* entry.execute(call);
} catch (err) {
	if (err instanceof ZodError) {
		yield invalidArgsError(call, entry, err);
		return;
	}
	throw err;
}
```

不要让 `agentLoop`、`round`、`scheduler` 都知道 Zod、HTTP 或具体工具执行错误。

### 5. 删除无行为的聚合函数

如果一个函数只有以下形状：

```ts
const result = [];
for (const item of items) {
	result.push(await callback(item));
}
return result;
```

并且它没有过滤、排序、错误处理、聚合语义或领域命名，那么它通常不值得单独存在。应将循环放回真正拥有该语义的函数。

### 6. 用删除测试验证重构方向

对可疑模块进行思想实验：

- 删除后复杂度消失：模块是透传层，应删除；
- 删除后复杂度集中到一个真正的接缝：模块有价值，应深化；
- 删除后复杂度散落到多个调用方：当前模块确实在提供局部性，不应简单删除；
- 删除后只是把参数换了名字：重构没有创造杠杆。

## 本仓库案例

### `ToolEntry` 的执行协议

旧结构同时支持流式和非流式执行，调用方必须理解 `stream` 字段并分支。

现在所有工具统一为异步生成器：

```ts
execute(call, confirmFn): AsyncGenerator<ToolStreamEvent>
```

`write` 和 `show` 只是产生一个事件，因此在注册时包装为单 chunk。执行方不再关心工具的实现模式。

这是一次真正的协议深化：调用方获得了更小的接口，而工具注册处集中承担了差异。

### `canStart` 不经过 `ToolRuntime`

`canStart` 是调度策略，不是执行语义。`ToolRuntime.canStart()` 过去只是：

```ts
toolkit.getEntry(call.tool)?.canStart
```

它没有增加行为，因此已移除。scheduler 需要调度策略时直接从工具注册表读取。

### 截断恢复批处理

`recoverPartialCalls()` 原来只是逐项调用 `recover(partial)`。它没有自己的领域判断，因此已删除；提取部分调用和执行恢复现在位于同一个 `recoverTruncatedCalls()` 中。

保留的 `recoverPartial()` 则有真实职责：它区分未知工具、恢复成功和恢复失败，并生成领域结果。

## Review 检查清单

审查函数或模块时，逐项检查：

- [ ] 每个参数都被当前函数直接消费；
- [ ] 没有把下游配置逐层向上传递；
- [ ] 没有把 `resolver`、`confirmFn`、`workspace` 等上下文重复传递；
- [ ] 没有把实现模式（如 stream/non-stream）泄漏给调用方；
- [ ] 错误在正确的接缝处完成翻译；
- [ ] 纯数组映射或单纯转发没有被伪装成独立模块；
- [ ] 依赖在边界处绑定，而不是在业务调用中重复传递；
- [ ] 删除该模块后，复杂度没有无意义地散落到多个调用方；
- [ ] 测试验证的是模块行为，而不是透传参数本身；
- [ ] 函数最大缩进没有因为包装层叠加而持续增加。

## 经验法则

> 一个好的接口只描述调用方需要提供的业务输入，不描述下游实现为了完成工作而需要的全部上下文。

> 如果函数不关心一个参数，就不应该接收它。

> 如果两个实现可以用同一个事件协议表达，就在注册边界归一化，而不是让调用方分支。

> 透传不是中立的：它把下游复杂度转化为上层接口复杂度，并扩大每次变更的影响范围。
