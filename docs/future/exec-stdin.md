# exec 交互式 stdin 支持

> 从 `ROADMAP.md` 移出。此功能需求不常见（大多数交互式 CLI 可通过提前传入参数解决），放入 future 留档。

**状态**：方案已确定，待实现

---

## 问题

当前 exec（observe/reason/act）进入 backgrounded 状态后，进程如果等待 stdin 输入，模型无法与之交互。

## 方案：stdinFile + fs.watch

进程 backgrounded 时创建 stdin 文件，模型通过 `write` 工具写入该文件即为输入。

流程：
1. 进程进入 backgrounded → 创建 `.temp/exec_bg_{pid}_stdin.txt`（空） → 返回 `stdinFile` 路径
2. 模型需要输入 → `write({ path: stdinFile, content: "内容\n" })`
3. executor 用 `fs.watch` 监听 `.temp/` 目录，检测到文件出现 → 50ms debounce → 读取 → 删除 → 转发到 stdin pipe
4. 文件删除 = 已消费，模型下次 write 新文件即可

## 排除的方案

| 方案 | 排除原因 |
|------|----------|
| 虚拟 write（path = `:pid`） | write 语义被污染，跨工具耦合，确定性承诺被打破 |
| exec 增加 `pid` 参数复用 | 一个工具用开关切换两种功能，职责不清 |
| 超时判断是否交互 | 不需要判断——统一创建 stdinFile，不交互时模型自然不写，零副作用 |

## 实现要点

- 监听目录而非文件（文件反复创建/删除，监听文件本身会失效）
- `processing` 锁防 Windows 上 rename+change 双事件导致重复消费
- 先删后转发，避免重复读取
- 进程退出时关闭 watcher
