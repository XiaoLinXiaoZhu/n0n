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
