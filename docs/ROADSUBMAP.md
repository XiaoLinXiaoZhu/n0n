# ROADSUBMAP：exec 拆分正式化

> 将 exec 从"工具"降级为"执行后端"，observe / reason / act 成为正式工具。
> 移除 unified/split 双模式开关，删除 exec 作为工具的所有痕迹。

设计依据见 ROADMAP.md exec-split 章节。

---

## 1. exec 降级为纯执行后端

**目标**：exec 不再出现在工具定义中，仅作为三个工具共享的底层执行引擎。

### 涉及文件

#### `packages/tools/src/exec/definition.ts`

- 移除 `makeExecToolDefinition`
- 保留 `makeObserveToolDefinition`、`makeReasonToolDefinition`、`makeActToolDefinition`
- 保留 `makeExecLikeDefinition` 作为内部共享的构建函数（不导出）
- 提炼执行后端接口：`ExecArgsSchema` 保持不变，它是后端的参数契约

#### `packages/tools/src/exec/index.ts`

- 移除 `makeExecToolDefinition` 的导出
- `execToolStream` 保留——它是执行后端，三个工具都调用它

#### `packages/tools/src/config.ts`

- 移除 `execMode` 字段（不再有 unified/split 切换）

#### `packages/tools/src/exec/split-prompt.ts（已删除）`

- ~~从"补充提示词片段"变为"正式提示词片段"~~ 该文件已删除，内容内联到 code.md
- ~~移除文件头注释中关于 execMode === "split" 的说明~~
- ~~内容保持不变——它已经是 observe/reason/act 的正式使用说明~~

---

## 2. 三个工具单独管理

**目标**：每个工具有独立的定义，但共享参数结构。参数一致性是刻意的设计——避免模型花注意力在"哪些参数这个工具有、哪个没有"上。围栏信号集中在工具名和 description，不在参数差异上。

### waitfor 差异化

三个工具共享 `{ script, runtime, cwd, waitfor }` 参数，但 waitfor 的默认值和描述应有差异：

| 工具 | waitfor 默认值 | waitfor 上限 | 描述调整 |
|------|---------------|-------------|---------|
| observe | 60 | 120 | "Max seconds to wait (default: 60, max: 120). Observation commands should complete quickly." |
| reason | 60 | 120 | "Max seconds to wait (default: 60, max: 120). Reasoning scripts should complete quickly." |
| act | 120 | 240 | "Max seconds to wait for process (default: 120, max: 240). Process continues in background if exceeded." |

### 实现方式

`makeExecLikeDefinition` 增加 waitfor 的默认值和上限参数：

```typescript
function makeExecLikeDefinition(
  platform: "win32" | "darwin" | "linux",
  name: string,
  description: string,
  waitforDefault: number,
  waitforMax: number,
): ToolDefinition
```

三个 `make*ToolDefinition` 函数各自传入不同的 waitfor 配置。

### 涉及文件

- `packages/tools/src/exec/definition.ts` — 上述修改
- `packages/tools/src/index.ts` — `buildBaseRegistry` 中移除 exec 条目

---

## 3. 注册表与类型系统

**目标**：ToolMap 中用 observe / reason / act 替换 exec。

### `packages/types/src/messages/tools/registry.ts`

```typescript
export interface ToolMap {
  observe: ExecArgs;
  reason: ExecArgs;
  act: ExecArgs;
  write: WriteArgs;
  edit: EditArgs;
  progress: ProgressArgs;
}
```

移除 `exec` 条目。三个工具共享 `ExecArgs` 类型（参数结构一致）。

同步更新导出的快捷类型：

```typescript
export type ObserveToolCall = ToolCallRecordMap["observe"];
export type ReasonToolCall = ToolCallRecordMap["reason"];
export type ActToolCall = ToolCallRecordMap["act"];
// 移除 ExecToolCall
```

### `packages/types/src/messages/tools/exec.ts`

改为 `execution-result.ts`（或保持原名，但修改内部类型）。

结果类型中的 `tool` 字段从固定的 `"exec"` 变为联合类型：

```typescript
type ExecToolName = "observe" | "reason" | "act";

export interface ExecCompleted extends MakeResult<ExecToolName, "completed"> { ... }
export interface ExecTruncated extends MakeResult<ExecToolName, "truncated"> { ... }
export interface ExecBackgrounded extends MakeResult<ExecToolName, "backgrounded"> { ... }
```

这样 `result.tool` 会携带实际的工具名（`"observe"` / `"reason"` / `"act"`），而非统一的 `"exec"`。

> 注意：MakeResult 的第一个类型参数当前约束为 `ToolName`（即 `keyof ToolMap`），改为联合类型后需要确认 `MakeResult` 的泛型约束是否兼容。如果 ToolMap 中已经有 observe/reason/act，则 `ExecToolName` 就是 `"observe" | "reason" | "act"` ⊂ `ToolName`，类型自然兼容。

### `packages/tools/src/index.ts`

`makeExecEntry` 中不再需要把 `call.tool` 重写为 `"exec"`：

```typescript
const makeExecEntry = (definition: ToolDefinition): ToolEntry => ({
  definition,
  stream: true,
  execute: (tc, confirmFn) => {
    // tc.tool 保持原值（"observe" / "reason" / "act"）
    const call = {
      id: tc.id,
      tool: tc.tool,
      args: ExecArgsSchema.parse(tc.args),
    };
    return execToolStream(call, confirmFn, execConfig);
  },
});
```

`REGISTERED_TOOLS` 移除 `"exec"`。

`TOOL_ORDER` 不再有条件分支：

```typescript
const TOOL_ORDER = ["progress", "observe", "reason", "act", "write", "edit"] as const;
```

### `packages/tools/src/exec/executor.ts`

当前 executor 内部硬编码了 `tool: "exec" as const`。需要改为接受工具名参数，或从传入的 call 对象中取：

```typescript
// 当前
type: "tool_result",
tool: "exec" as const,
call,

// 改为
type: "tool_result",
tool: call.tool,
call,
```

executor 不需要知道自己为哪个工具服务——它从 call 对象中透传工具名。

### 涉及文件

- `packages/types/src/messages/tools/registry.ts`
- `packages/types/src/messages/tools/exec.ts`
- `packages/types/src/messages/tools/index.ts`（更新导出）
- `packages/types/src/messages/assistant.ts`（如果引用了 ExecToolCall）
- `packages/tools/src/index.ts`
- `packages/tools/src/exec/executor.ts`

---

## 4. 独立 format

**目标**：每个工具有独立的格式化方式，让 tool_result 在上下文中也携带围栏信号。

### `packages/shared/src/format-prompt/format-exec.ts`

拆分或参数化。两种方案：

**方案 A：参数化（推荐）**

保持一个 `formatExecResult` 函数，但根据 `msg.tool` 注入不同的前缀/标签：

```typescript
export function formatExecResult(
  msg: ExecToolResult,
  tags: TagAdapter,
  msgIndex: number,
): FormattedToolResult {
  const toolLabel = msg.tool; // "observe" | "reason" | "act"
  // exec_meta tag 改为携带工具名
  // 例如 [observe] [cwd: .] [exit: 0] [80ms]
  //      [act] [cwd: .] [exit: 0] [200ms]
  ...
}
```

meta 模板中的 `exec` 标识替换为实际工具名。其余格式化逻辑（truncated/backgrounded/completed）保持不变——它们是执行后端的通用行为，不因工具名而异。

### reason 的特殊格式化

reason 的 description 说"output is for the model's own consumption, not presented to the user"。可以在 format 时加一个标注，强化围栏：

```typescript
if (toolLabel === "reason") {
  // reason 的输出标注为内部思考
  factParts.unshift(tags.wrapTag("exec_meta", 
    `[reason — internal] ${metaFn(runtime, cwd, msg.exitCode, msg.durationMs)}`));
}
```

这让模型在回顾历史时，从 result 格式就能感知"这是我自己的思考过程"。

### 涉及文件

- `packages/shared/src/format-prompt/format-exec.ts`
- `packages/shared/src/format-prompt/index.ts`

---

## 5. 渲染层适配

**目标**：CLI 渲染中区分三种工具的展示。

### `packages/cli-ui/src/rich-renderer.ts`

当前 `case "exec"` 改为三个 case，可以用不同颜色区分：

```typescript
case "observe": {
  return `${style.dim("◂")} ${style.blue("observe")} ${duration} ...`;
}
case "reason": {
  return `${style.dim("◂")} ${style.magenta("reason")} ${duration} ...`;
}
case "act": {
  return `${style.dim("◂")} ${style.cyan("act")} ${duration} ...`;
}
```

或者共享一个 helper，根据工具名选择颜色：

```typescript
const toolColors = { observe: style.blue, reason: style.magenta, act: style.cyan };
```

### 涉及文件

- `packages/cli-ui/src/rich-renderer.ts`

---

## 6. 清理 unified 模式遗留

**目标**：移除 exec 作为工具和 unified/split 切换的所有痕迹。

| 文件 | 清理内容 |
|------|---------|
| `apps/code/src/index.ts` | 移除 `EXEC_MODE` 环境变量读取 |
| `apps/code/src/repl.ts` | 移除 SPLIT_TOOLS_PROMPT 导入，内容已内联到 code.md |
| `apps/code/src/headless.ts` | 同上 |
| `apps/code/src/context-fewshot.ts` | 移除 split 模式的 tool name 重映射逻辑（fewshot 中直接使用 observe/act） |
| `packages/tools/src/config.ts` | 移除 `execMode` 字段 |
| `packages/core/src/runtime.ts` | 移除 `buildToolsConfig` 中的 execMode 透传 |
| `docs/ROADMAP.md` | 更新"exec 拆分实验"条目状态为"已确认，已正式化" |

---

## 实施顺序

建议按依赖关系分步实施，每步可独立验证：

1. **类型层**：修改 ToolMap、结果类型，让 tsc 报出所有需要适配的位置
2. **执行后端**：executor.ts 透传 tool name，不再硬编码 "exec"
3. **工具定义**：移除 exec 工具定义，调整 waitfor 参数
4. **注册表**：修改 index.ts，移除 exec 条目和 execMode 开关
5. **格式化**：format-exec.ts 参数化，format-prompt/index.ts 更新 switch
6. **渲染层**：rich-renderer.ts 适配三个工具名
7. **清理**：移除所有 unified 模式遗留代码
8. **测试**：更新现有测试中的 `tool: "exec"` 断言
