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
   - 不再使用 FIFO，而是每个工具各自管理自己的动态区域。
   - 全部工具完成后，输出固化到 scrollback（`vp.commit`）。
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
   - 动态渲染到 commit 的样式应该基本不变

6. **移除旧依赖**
   - `apps/code` 不再依赖 `@n0n/multiline-input`（包本身保留）。
   - 删除 `apps/code/src/code-renderer.ts`。

### 不做什么

- 不修改 `packages/core` 的 agentLoop / Renderer 接口。
- 不修改 `packages/types` 的 Renderer 接口。
- 不删除 `packages/cli-ui` 的 RichRenderer（其他 app 可能用）。
- 不删除 `packages/multiline-input` 包。

## 四个变体

类似 topK 采样，请你提供给我你认为最正确的 4 个不同的实现。

这样，我可以在这里面对比、指出那4个变体中，哪个更好，从而你可以更轻松的找到如何优化实现，以及如何决定最终的实现方案。

## 参考

- `apps/code/node_modules/@xlxz/terminal-renderer/demo/history.ts` — mount/render/commit 循环
- `packages/terminal-renderer/SPEC.md` — 设计规格
- `apps/code/src/code-renderer.ts`（待删除）— WritePreview 逻辑来源
- `packages/cli-ui/src/rich-renderer.ts` — 旧渲染器，风格参考
