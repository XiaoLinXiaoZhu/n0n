# 终端渲染迁移需求

> 状态：待确认 · 分支：mvp

## 背景

将 `apps/code` 的终端渲染栈从旧的自研组件（RichRenderer + RenderBuffer FIFO + multiline-input）替换为 `@xlxz/terminal-renderer`（Grid + Viewport + TextInput + parseKey）。

`@xlxz/terminal-renderer` 的核心模型（参考 `demo/history.ts`）：

```
mount → (render × N) → commit → mount → ...
  │        │              │         │
  │        │              │         └─ 重新预留底部动态空间
  │        │              └─ 清除动态区域 + 输出固化文本到 scrollback
  │        └─ 更新 Grid 内容 + 定位光标
  └─ 在终端底部预留 N 行动态空间
```

- **scrollback**：终端原生的历史滚动区，内容永久保留。
- **Grid**：底部的固定行数动态区域，内容在 `commit` 后从 Grid 转移到 scrollback。
- **Viewport**：管理 Grid 的生命周期，负责 mount / render / commit / remount。

## 验收标准

### 必须实现

1. **LLM 流式输出 → scrollback**
   - thinking（灰色）、content（正常色）、toolCallArg（结构化渲染 `▸ 工具名 + 参数字段`）均直接写入 stderr scrollback。
   - 不经过 Grid。
   - 与旧 RichRenderer 的显示效果一致。

2. **write 流式磁盘预览保留**
   - WritePreviewManager 独立模块，在 `toolCallArgChunk` 中增量解析 partial JSON，写入目标文件。
   - path 锁定逻辑不变（content key 出现后才锁定 path，避免截断垃圾文件）。

3. **工具执行输出 → Grid 动态区域**
   - 工具执行期间，输出显示在终端底部的 Grid 动态区域（替代旧 LiveRegion 的 in-place 更新）。
   - 工具完成后，输出固化到 scrollback（`vp.commit`）。
   - 需处理多个工具并发执行的场景。

4. **输入 → TextInput + parseKey**
   - `promptUser()`：多行输入，Alt+Enter 提交，Ctrl+Q/Ctrl+C 中断。
   - `confirmFn()`：单行确认输入。
   - 均基于 TextInput + Grid + Viewport（history demo 模式）。
   - 非 TTY 环境回退到 readline `createInterface`。

5. **不破坏已有功能**
   - Agent loop、REPL 命令（exit/pause/log）、Ctrl+Q 中断、Ctrl+P 暂停心跳。
   - PlainRenderer 非 TTY fallback。
   - 类型检查通过，现有测试通过。

6. **移除旧依赖**
   - `apps/code` 不再依赖 `@n0n/multiline-input`（包本身保留）。
   - 删除 `apps/code/src/code-renderer.ts`。

### 不做什么

- 不修改 `packages/core` 的 agentLoop / Renderer 接口。
- 不修改 `packages/types` 的 Renderer 接口。
- 不删除 `packages/cli-ui` 的 RichRenderer（其他 app 可能用）。
- 不删除 `packages/multiline-input` 包。

## 四个变体

核心问题：**多个工具并发执行时，如何分配 Grid 动态区域？**

以下 4 种变体代表了不同的权衡点，均基于 history demo 的 mount→render→commit 模型。

### 变体 A：FIFO Commit Cycle

一次只渲染一个工具。工具按到达顺序排队，当前工具占满整个 Grid。
完成后 `vp.commit(toolResult)` 固化到 scrollback，下一个工具接管 Grid。

| 优点 | 缺点 |
|------|------|
| 最接近 history demo 模式，简单可靠 | 看不到并发工具的进度 |
| 每次 commit 产生干净的 scrollback 条目 | 工具串行化可能感觉慢 |
| 无 zone 管理复杂度 | |

### 变体 B：Fixed Zones + Batch Commit

Grid 均分为固定行数 zone。所有工具同时可见。全部完成后一次性
`vp.commit()` 固化所有结果到 scrollback。

| 优点 | 缺点 |
|------|------|
| 看到所有并发工具的实时输出 | 必须等全部完成才能看到 scrollback 结果 |
| 布局可预测 | 工具多时 zone 太小 |
| 单次 commit，ANSI 输出最干净 | |

### 变体 C：Fixed Zones + Progressive Commit

Grid 均分为固定 zone。某个工具完成后，其 zone 内容立即通过
`vp.commit()` 固化到 scrollback，Grid 缩行 remount，剩余工具 rebalance。

| 优点 | 缺点 |
|------|------|
| 并发可见 + 结果即时固化 | 多次 commit/remount 可能造成闪烁 |
| 与 history demo 的 submit 节奏一致 | 实现复杂度最高 |

### 变体 D：Scrollback-native

完全不使用 Grid 渲染工具输出。工具输出直接写入 stderr scrollback
（sgrFromEncoded 样式）。Grid 仅用于输入 prompt。

| 优点 | 缺点 |
|------|------|
| 最接近旧 RichRenderer 的 scrollback-native 风格 | 无 in-place 更新（输出流走后无法修改） |
| 零 zone 管理 | 大量输出会快速撑满 scrollback |

## 未决问题

1. 变体 A/C 的 commit 时机：工具完成时立即 commit 还是等一轮全部结束？
2. 变体 B/C 的 zone 最小行数：终端高度 24 行时，多少行为宜？
3. Grid 应占终端多少行？全高减去 margin，还是固定比例？

## 参考

- `apps/code/node_modules/@xlxz/terminal-renderer/demo/history.ts` — mount/render/commit 循环
- `packages/terminal-renderer/SPEC.md` — 设计规格
- `apps/code/src/code-renderer.ts`（待删除）— WritePreview 逻辑来源
- `packages/cli-ui/src/rich-renderer.ts` — 旧渲染器，风格参考
