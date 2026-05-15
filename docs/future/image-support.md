# 图片支持 — 设计备忘

## 背景

`feat/exec-image-output` 分支尝试实现"exec 产出图片 → 自动提供给模型"的能力。
参考 Kimi 的做法：模型通过 python shell 执行 PIL 打开图片，结果自动可见。

## 当前分支实现（已搁置）

采用**被动扫描**模式：

1. `BaseWorkspacePaths` 新增 `img` 路径（`.temp/img/`）
2. `agentLoop` 每轮循环末尾调用 `collectImages()` 扫描目录
3. 新增图片作为 `generic_image` 消息（user role）注入历史
4. `formatPrompt` 将图片转为 multipart content block 或降级文本
5. 各 LLM Client 支持 image content block（Anthropic/OpenAI/Gemini）
6. `LLM_IMAGES` 环境变量控制开关

## 踩过的坑

### 1. 扫描时序不稳定

`collectImages` 基于 `lastImageScanTime` 做增量检测，但：
- 变量在 `agentLoop` 内部，每次外部调用（用户新消息、progress working 回调）都会重新进入 agentLoop，`lastImageScanTime` 重置为 0
- 导致同一张图片被反复扫描、反复注入上下文

### 2. 图片与产出操作脱钩

图片作为独立的 user 消息注入，和产出它的 exec 调用在上下文中分离。
模型看到的是"突然冒出一条图片消息"，而非"我刚执行的命令产出了这张图"。
语义不清晰，且可能出现在不相关的对话轮次中。

### 3. 每轮扫描造成噪音

即使没有新图片，扫描逻辑也在每轮执行。当 `LLM_IMAGES=false` 时，
降级路径仍然输出"image display not supported"文本，污染上下文。

### 4. 多 agent 碰撞风险

所有 exec 共享同一个 `.temp/img/` 目录。如果多个 agent 并行工作
（或同一 agent 并行执行多个 exec），图片文件可能互相覆盖或误归属。

## 未来方向：绑定到 exec tool_result

### 核心思路

图片不应是独立消息，而应作为 exec 执行结果的一部分返回：

```
exec 执行 → 产出图片 → 图片 attach 到该次 exec 的 tool_result → 模型直接可见
```

### 待解决的设计问题

**图片归属隔离**：每次 exec 调用应有独立的图片输出空间，避免共享目录碰撞。
可能方案：
- 每次 exec 分配独立子目录（如 `.temp/img/<exec-id>/`）
- 或者约定特殊的 stdout 协议（类似 Jupyter 的 display_data）
- 或者 exec 声明输出文件路径，executor 读取后清理

**用户上传图片**：用户手动放入的图片如何进入模型视野？
- 方案 A：模型通过 exec 主动 `cp` 到输出目录 → 走同一条路径
- 方案 B：用户消息中支持直接附带图片（需要 input 层改动）
- 方案 C：保留一个"上传目录"，模型需要时 exec 读取

**token 预算**：base64 图片很大，需要考虑：
- 单张大小上限（当前 5MB）
- 单轮总图片数量上限
- 是否需要自动压缩/缩放

**模型兼容性**：不是所有模型都支持 image content block。
`LLM_IMAGES` 开关仍然需要，不支持时 exec 结果中只标注"有图片产出"但不嵌入。

### 实现草案

```
1. ExecToolResult 类型新增 images?: ImageData[] 字段
2. exec executor 执行前快照输出目录，执行后 diff 取新增文件
3. 新增文件读取为 base64，attach 到 tool_result.images
4. format-exec 格式化时：
   - imagesSupported=true → 嵌入 image content block
   - imagesSupported=false → 文本标注 "[N images produced, not displayed]"
5. 删除 collectImages / generic_image / 每轮扫描逻辑
```

## 参考

- Kimi 图片处理：模型调 python shell → PIL 打开图片 → 结果自动展示
- Jupyter：cell 执行后 display_data 跟随 execution_result 返回
- 当前分支：`feat/exec-image-output`（14 commits，保留供参考）
