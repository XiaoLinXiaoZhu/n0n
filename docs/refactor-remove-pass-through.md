# 移除透传重构清单（lm-linter pass-through 审计）

> 状态：草案（P0 已确认 / P1 建议 / P2 待裁决 / P3 测试内）
> 依据标准：[`docs/architecture-no-forwarding.md`](./architecture-no-forwarding.md)
> 审计工具：`lm-linter audit pass-through`（全局安装），202 个文件 / 562 个函数 / 242 条诊断

## 1. 背景

对全仓执行 `lm-linter audit pass-through` 产出 242 条诊断（58 error + 184 warning；172 条 pass-through-parameter + 70 条 unused-parameter）。逐条人工核对源码后，按《architecture-no-forwarding.md》的判定标准重新分类：

- **透传 / 半透传**（参数未被本模块直接消费，仅搬运给下游）→ 本清单的修改项；
- **真正的适配器**（错误翻译、协议归一化、生命周期管理发生在该层）→ 保留；
- **数据输入**（参数决定函数核心输出，"转发"即计算本身）→ 保留；
- **构造消费**（参数用于构建返回值/闭包）→ 保留；
- **接口强制**（签名由 `implements`/回调类型规定）→ 保留。

判定五问（对每个参数）：本函数是否读取它？是否根据它做分支？是否改变它的语义/格式？是否用它建立更深的抽象？删除它行为是否改变？五问皆否 → 该参数不应出现在此接口。

**汇总**：25 条进入本清单（含 6 条待裁决），217 条判定为非透传（不改，见 §7）。

## 2. 修改项总览

| # | 位置 | 类型 | 状态 |
|---|------|------|------|
| 1 | `packages/llm/src/base-url.ts` 三端点函数 | 纯转发+常量 | P0 已确认 |
| 2 | `packages/shared/src/tokens.ts` `estimateTokens` | 纯别名转发 | P0 已确认 |
| 3 | `packages/tools/src/write.ts` `writeTool`/`writeToolRecovered` | 无行为中间层 | P0 已确认 |
| 4 | `packages/tools/src/exec/executor.ts` `execToolStream.confirmFn` | 回调透传 | P1 建议 |
| 5 | `packages/format-prompt/src/index.ts` `toolResultToStructured.tags` | 能力透传 | P1 建议 |
| 6 | `apps/code/src/repl/handle-result.ts` `handleShowResult.notifyConfig` | 能力透传 | P1 建议 |
| 7 | `packages/core/src/agent/loop.ts` `classifyRound` 死参数 | 死参数 | P1 建议 |
| 8 | `packages/format-prompt/src/format-exec.ts` `formatChunkGuide._outputFile` | 死参数 | P1 建议 |
| 9 | 4 个 LLM client 的 `stream.signal` | 能力透传（接口层） | P2 待裁决 |
| 10 | `packages/cli-ui/src/ansi.ts` `write`/`visibleWidth` | 别名转发 | P2 待裁决 |
| 11 | `makeToolkit._model` / `handleBlockedCommand._cwd` | 死参数（公共签名） | P2 待裁决 |
| 12 | `packages/core/src/agent/__tests__/streaming.test.ts` `collect.signal` | 测试内透传 | P3 低优先 |

---

## 3. P0 已确认修改

### 3.1 base-url：`parseBaseUrl` 直接返回三个端点 URL

**问题**：`chatCompletionsUrl`/`messagesUrl`/`modelsUrl` 三个导出函数只做 `appendPath(baseUrl, suffix)`，是纯转发+常量层。使用方（5 个 client + ping）每次调用都要先持 `baseUrl` 再转发，链路多一层，接口被无谓加宽。

**改动**（`packages/llm/src/base-url.ts`）：

```ts
export type BaseUrlResult =
  | {
      ok: true;
      baseUrl: BaseUrl;
      /** 三个端点 URL 随解析结果一次返回，使用方 parse 后直接取用 */
      chatCompletionsUrl: URL;
      messagesUrl: URL;
      modelsUrl: URL;
    }
  | { ok: false; error: string };

export function parseBaseUrl(raw: string): BaseUrlResult {
  const normalized = raw
    .replace(/\/chat\/completions\/?$/, "")
    .replace(/\/messages\/?$/, "")
    .replace(/\/v1\/?$/, "")
    .replace(/\/$/, "");
  try {
    const url = new URL(normalized);
    const baseUrl = url as BaseUrl;
    return {
      ok: true,
      baseUrl,
      chatCompletionsUrl: appendPath(baseUrl, "/v1/chat/completions"),
      messagesUrl: appendPath(baseUrl, "/v1/messages"),
      modelsUrl: appendPath(baseUrl, "/v1/models"),
    };
  } catch {
    return { ok: false, error: `无效的 base_url: "${raw}"` };
  }
}
```

删除三个导出函数 `chatCompletionsUrl`/`messagesUrl`/`modelsUrl`（`appendPath` 保留，仅 `parseBaseUrl` 内部使用）。

**影响面**（全部在 `packages/llm` 内）：

| 文件 | 现状 | 改动 |
|------|------|------|
| `anthropic-client/client.ts:56` | `apiUrl: messagesUrl(this.baseUrl)` | 构造器存 `this.messagesUrl = result.messagesUrl`，此处直接引用 |
| `anthropic-client/client.ts:108,175` | `fetch(messagesUrl(this.baseUrl), …)` | `fetch(this.messagesUrl, …)` |
| `deepseek-client/index.ts:47,80,136,151` | parse 后存 baseUrl；fetch 时 `chatCompletionsUrl(this.baseUrl)`；ping 传 baseUrl | 存 `this.chatCompletionsUrl`/`this.modelsUrl`；ping 传 `this.modelsUrl` |
| `openai-client/index.ts:52,80,129,144` | 同上 | 同上 |
| `openai-compatible-client/index.ts:55,88,141,156` | 同上 | 同上 |
| `gemini-client/index.ts:64,95,148` | 同上 | 同上 |
| `ping.ts:8,20-25` | `pingModelsEndpoint(baseUrl, apiKey)` 内调 `modelsUrl(baseUrl)` | 签名改为 `pingModelsEndpoint(modelsUrl: URL, apiKey)`，直接使用参数 |

**验证**：`bun run tsgo --noEmit`；`bun test`（`packages/llm` 的 gemini-smoke / heartbeat-integration）。

### 3.2 estimateTokens：消除别名转发

**问题**：`estimateTokens(text)` 只是 `estimateTokenCount(text)` 的别名（历史债务——此前用中英文字符手动计数估算，接入 tokenx 后遗留）。无语义转换，转发层。

**改动**：

| 文件 | 现状 | 改动 |
|------|------|------|
| `packages/shared/src/tokens.ts:22-24` | `export function estimateTokens(text){ return estimateTokenCount(text); }` | 删除；内部 7 处调用（`tailByTokens`×2、`headByTokens`×2、`splitLinesByTokenBudget`×3）改为直接调 `estimateTokenCount` |
| `packages/shared/src/index.ts:45` | 再导出 `estimateTokens` | 移除 |
| `packages/tools/src/exec/executor.ts:22,325` | `import { estimateTokens } from "@n0n/shared"`；`:325` 用于截断阈值 | 改 `import { estimateTokenCount } from "tokenx"`；调用点同步替换 |
| `packages/cli-ui/src/rich-renderer.ts:11,333,472` | 同上（展示 `~N tok`） | 同上 |
| `packages/shared/src/__tests__/split-lines-by-token-budget.test.ts:2,25` | `import { estimateTokens, … }` | 改 `estimateTokenCount` |
| `@n0n/tools`、`@n0n/cli-ui` package.json | 无 tokenx | **新增依赖 `tokenx`**（当前仅 `@n0n/shared` 声明） |

**注意**：消除后 tokenx 成为 `@n0n/tools` 与 `@n0n/cli-ui` 的直接依赖（此前经 `@n0n/shared` 间接）。这是本次唯一引入新依赖的改动。

**验证**：`bun run tsgo --noEmit`；`bun test`（tools exec 系列、shared split-lines 测试）。

### 3.3 writeTool / writeToolRecovered：删除无行为中间层

**问题**：`writeTool` 与 `writeToolRecovered` 只做 `writeFile(call, workspace, "completed"|"recovered")`——无决策、无转换、无错误处理（都在 `writeFile` 内），仅附加一个常量 status。调用方直连 `writeFile` 以 status 字面量表达同等语义，且链路少一层。

**改动**：

```ts
// packages/tools/src/write.ts
// 删除 writeTool（:48-53）与 writeToolRecovered（:56-61）
// writeFile（:64）改为导出：
export async function writeFile(
  call: WriteToolCall,
  workspace: string,
  successStatus: "completed" | "recovered",
): Promise<WriteToolResult> { /* 原有实现不变 */ }
```

| 调用方 | 现状 | 改动 |
|--------|------|------|
| `packages/tools/src/index.ts:37-40`（import）、`:97` | `writeTool(call, toolsConfig.workspace)` | 改 import `writeFile`；调用改为 `writeFile(call, toolsConfig.workspace, "completed")` |
| `packages/tools/src/write.ts:117`（makeWriteRecover 内） | `writeToolRecovered(call, workspace)` | `writeFile(call, workspace, "recovered")` |

**影响面核查**：`writeTool`/`writeToolRecovered` 未被 `@n0n/tools` 再导出，全仓仅上述两处调用。无测试直接依赖。

**验证**：`bun run tsgo --noEmit`；`bun test`（tools toolkit 测试、write 相关）。

---

## 4. P1 建议修改（低风险）

### 4.1 `execToolStream.confirmFn` → 并入 `toolsConfig`

**位置**：`packages/tools/src/exec/executor.ts:204-206,245`
**问题**：`execToolStream` 是 exec 执行边界，但 `confirmFn` 仅在第 245 行转发给 `handleBlockedCommand`，函数自身不读取、不分支（五问皆否）。
**改动**：
- `toolsConfig` 内联类型新增 `confirmFn?: (question: string) => Promise<string>`；签名改为 `execToolStream(call, toolsConfig)`；
- 第 245 行改为 `handleBlockedCommand(call, cwd, blockedCmd, platform, toolsConfig.confirmFn)`；
- 调用方 `packages/tools/src/index.ts:80`：`execToolStream(call, { ...execConfig, confirmFn })`；
- 4 个测试文件（`exec-waitfor.test.ts:36`、`exec-truncate.test.ts:34`、`exec-escape.test.ts:30`、`exec-bg-sync.test.ts:48`）：去掉 `undefined` 第二参数。

### 4.2 `toolResultToStructured.tags` → 调用点绑定

**位置**：`packages/format-prompt/src/index.ts:46-57`（定义）、`:214`（调用）
**问题**：分发器只消费 `msg`（路由），`tags` 纯转发给子格式化函数。
**改动**：改为闭包工厂，`tags` 在 `formatPrompt` 边界绑定一次：

```ts
function makeToolResultDispatcher(tags: TagAdapter) {
  return (msg: ToolResult, msgIndex: number): FormattedToolResult => {
    switch (msg.tool) {
      case "observe": case "reason": case "act":
        return formatExecResult(msg, tags, msgIndex);
      case "write": return formatWriteResult(msg, tags, msgIndex);
      case "show": return formatShowResult(msg, tags, msgIndex);
      default: { const _exhaustive: never = msg; throw new Error("Unknown tool"); }
    }
  };
}
// formatPrompt 内：const toStructured = makeToolResultDispatcher(tags);
// :214 调用改为 toStructured(msg, i)
```

### 4.3 `handleShowResult.notifyConfig` → 边界绑定行为

**位置**：`apps/code/src/repl/handle-result.ts:39`（签名）、`:55,61`（`playNotifySound(notifyConfig)`）
**问题**：函数核心输出（`HandleResultOutcome`）不依赖 `notifyConfig`，仅两个分支转发给 `playNotifySound`。
**改动**：签名改为 `handleShowResult(ir, history, showWriter, notify: () => void)`；两个分支直接 `notify()`。调用方 `apps/code/src/repl/index.ts` 传入 `() => playNotifySound(notifyConfig)`。函数直接消费 `notify`（调用它），不再是透传。

### 4.4 `classifyRound` 死参数删除

**位置**：`packages/core/src/agent/loop.ts:161`（调用）、`:291-294`（签名）
**问题**：`_idleCount`/`_maxIdleRounds` 从未使用——空转上限判断在 `loop.ts:188` 由调用方完成（`if (idleCount >= maxIdleRounds)`），函数内部无任何依赖。私有函数、单调用方。
**改动**：调用改 `classifyRound(result)`；签名删两个参数。

### 4.5 `formatChunkGuide._outputFile` 死参数删除

**位置**：`packages/format-prompt/src/format-exec.ts:67`
**改动**：删除参数并同步更新函数内调用点。

---

## 5. P2 待裁决

### 5.1 四个内联 client 的 `stream.signal`（接口层决策）

**位置**：`packages/llm/src/{deepseek,gemini,openai,openai-compatible}-client/index.ts:54,71,59,62`；接口定义 `packages/types/src/client.ts:158`（`LLMClient.stream(request, signal?)`）
**问题**：`stream` 方法不消费 `signal`，仅转发给自身 `fetch(…, { signal })`（与 `anthropicStream.signal` 同型，但签名受接口约束）。
**三个选项**：
- (a) transport 注入 client 构造器（`fetch` 绑定 method/headers，signal 在调用点绑定）；
- (b) 修改 `LLMClient.stream` 接口签名（破坏性，影响所有 client 与调用方）；
- (c) 接受"接口实现即绑定边界"，不处理。

### 5.2 `ansi.ts` 别名转发

**位置**：`packages/cli-ui/src/ansi.ts:83`（`write`→`out.write`）、`:110`（`visibleWidth`→`stringWidth`）
**问题**：与 `estimateTokens` 同型（别名转发），但 `write` 隐藏模块私有 `out`（封装价值），`visibleWidth` 提供领域语义名。是否按 writeTool 标准一并消除，待裁决。

### 5.3 公共签名死参数

- `packages/tools/src/index.ts:122` `makeToolkit._model`：4 个调用方传 `client.modelId`，JSDoc 注明"保留接口兼容"。删除需同步 4 处调用点。
- `packages/tools/src/exec/security.ts:48` `handleBlockedCommand._cwd`：1 个调用方（executor.ts:240）传 `cwd`。删除需同步调用点。

---

## 6. P3 测试内

- `packages/core/src/agent/__tests__/streaming.test.ts:27` `collect.signal`：测试 helper 转发给 `parseStream`。模式相同但价值低，可不改。

---

## 7. 非透传项（217 条，不改）

| 类别 | 数量 | 代表 |
|------|------|------|
| 数据输入（转发即函数自身计算） | 93 | `detectMention.cursorOffset`（切片检测）、`createSessionDir.tempDir`（扫描+编号）、`readUntilStop.index`（多终止符算法）、`openPaths.command/paths`（spawn+错误处理编排）、`parseChatCompletionText.json`（边界 schema 校验）、`expire.reason`（触发回调是函数目的） |
| 构造消费（参数构建返回值/闭包） | 38 | `buildToolsConfig.agent/security`、`buildToolCallMessage.toolCalls`、`createTagAdapter.style`、`createToolkitSession.resolve/confirmFn`、`makeWriteRecover.workspace`、`makeUserInput.content` |
| 接口强制（签名由类型契约规定） | 40 | `PlainRenderer`/`RichRenderer` 的 `implements Renderer` 方法族、`CanStartFn.active`、`ToolExecutor.confirmFn`、`HeartbeatCallbacks.request`、`SchedulerEvents._tool` |
| 测试辅助（构造/mock） | 46 | `mockExecTC(id, script)` 等 fixture 工厂 |

---

## 8. 执行顺序与验证

1. 每个修改项独立提交，便于回滚；
2. 每项完成后依次执行：`bun run tsgo --noEmit` → `bun test` → `bun run biome check --fix`；
3. P0 三项（§3）先行，P1（§4）次之，P2/P3 待裁决后补；
4. 唯一新增依赖：`tokenx` 进入 `@n0n/tools` 与 `@n0n/cli-ui`（§3.2）。
