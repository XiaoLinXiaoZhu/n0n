# ROADMAP

> 记录已确定方向但尚未实现的功能。每项包含设计结论和关键决策依据。

---

## exec 交互式 stdin 支持

**状态**：方案已确定，待实现

### 问题

当前 exec 进入 backgrounded 状态后，进程如果等待 stdin 输入，模型无法与之交互。

### 方案：stdinFile + fs.watch

进程 backgrounded 时创建 stdin 文件，模型通过 `write` 工具写入该文件即为输入。

流程：
1. 进程进入 backgrounded → 创建 `.temp/exec_bg_{pid}_stdin.txt`（空） → 返回 `stdinFile` 路径
2. 模型需要输入 → `write({ path: stdinFile, content: "内容\n" })`
3. executor 用 `fs.watch` 监听 `.temp/` 目录，检测到文件出现 → 50ms debounce → 读取 → 删除 → 转发到 stdin pipe
4. 文件删除 = 已消费，模型下次 write 新文件即可

### 排除的方案

| 方案 | 排除原因 |
|------|----------|
| 虚拟 write（path = `:pid`） | write 语义被污染，跨工具耦合，确定性承诺被打破 |
| exec 增加 `pid` 参数复用 | 一个工具用开关切换两种功能，职责不清 |
| 超时判断是否交互 | 不需要判断——统一创建 stdinFile，不交互时模型自然不写，零副作用 |

### 实现要点

- 监听目录而非文件（文件反复创建/删除，监听文件本身会失效）
- `processing` 锁防 Windows 上 rename+change 双事件导致重复消费
- 先删后转发，避免重复读取
- 进程退出时关闭 watcher

---

## exec 拆分实验：observe / reason / act

**状态**：已实现，实验中

### 背景

当前 exec 承担了四种认知角色（观察、推理、执行、验证），对弱模型负担重。基于 JEPA 认知循环，拆分为三个语义工具进行对比实验。

### 开关

环境变量 `EXEC_MODE=split`（默认 `unified`）。

### 影响范围

设置 `EXEC_MODE=split` 后，以下行为发生变化：

| 组件 | unified 模式 | split 模式 |
|------|-------------|------------|
| 工具定义（发送给 LLM） | exec | observe, reason, act |
| 系统提示词 | 原始 code.md | code.md + SPLIT_TOOLS_PROMPT |
| fewshot 示例 | 工具名 exec | 工具名映射为 observe/act |
| getEntry 解析 | 仅 exec 可解析 | 仅 observe/reason/act 可解析 |
| tool_result 格式化 | 不变（result.tool 始终为 "exec"） | 不变 |
| domain message 记录 | assistant_tool_call 中 tool="exec" | assistant_tool_call 中 tool="observe"/"reason"/"act" |

不受影响的：executor 逻辑、安全检查、截断/后台机制、write/edit/progress。

### 涉及文件

- `packages/tools/src/config.ts` — execMode 字段
- `packages/tools/src/exec/definition.ts` — 三工具定义
- `packages/tools/src/exec/split-prompt.ts` — 配套提示词
- `packages/tools/src/index.ts` — 注册逻辑、activeTools 过滤
- `packages/core/src/runtime.ts` — buildToolsConfig 透传
- `apps/code/src/index.ts` — 读取环境变量
- `apps/code/src/repl.ts` / `headless.ts` — 注入 prompt、传递 execMode 到 fewshot
- `apps/code/src/context-fewshot.ts` — split 模式 tool name 重映射

### 后续方向

实验完成后，应选择一种模式作为 SSOT（Single Source of Truth），移除另一种的代码路径：

- 若 split 模式效果更好 → 删除 unified 代码路径，observe/reason/act 成为正式工具，注册到 ToolMap 类型系统
- 若 unified 模式更好 → 删除 split 相关的定义、prompt、fewshot 重映射逻辑
- 不应长期保留两套并行维护——开关机制仅用于实验对比阶段

---

## 上下文压缩

**状态**：接口已设计，待实现

详见 `docs/TODO.md` 和 wiki `工作日志/压缩开发计划`。

核心清单：
- 通用压缩接口（`DomainMessage[]` → 摘要 `DomainMessage`）
- 压缩后端选择逻辑
- 触发策略（上下文大小阈值 / 成本预估）
- 与 fairy `view.ts` 跳变窗口机制协调

---

## exec 图片输出

**状态**：方向已确定，旧分支搁置

详见 `docs/design/image-support.md`。

核心决策：图片绑定到 exec 的 tool_result，而非作为独立消息注入。

待解决：
- 每次 exec 的图片输出隔离（独立子目录 or stdout 协议）
- token 预算控制（单张上限、自动缩放）
- 不支持图片的模型降级路径
