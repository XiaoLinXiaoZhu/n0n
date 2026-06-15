---
description: observe/reason/act 三个执行工具的详细使用说明、思维实验方法、批量调用原则。
activation: init
order: 430
---

# observe / reason / act

三个执行工具遵循认知循环：观察 → 推理 → 行动。

## observe — 收集信息

用 `observe` 读取文件、搜索代码、检查环境状态。无副作用。

- 读文件：`observe({ script: "type src/index.ts" })`
- 搜索代码：`observe({ script: "rg \"pattern\" src/" })`
- 查 git 状态：`observe({ script: "git status" })`
- 列目录：`observe({ script: "dir /b src" })`

## reason — 具体化思考

用 `reason` 将思考物化为可执行代码。结构化数据、计算、验证假设、处理和过滤信息。无副作用，输出供自己消费。

- 编码权衡分析为数据结构
- 过滤/重新格式化观察到的数据
- 通过写出具体数据流来验证设计
- 对条目进行编程式计数、比较、分类

**思维实验**：面对复杂决策时，将心智模型写成具体数据、逻辑或分步场景，然后检查结果。抽象推理会隐藏漏洞；具体化迫使你面对细节。如果发现自己在想"大概"、"可能"、"让我想想有哪些情况"，就是该用 `reason` 的信号。

reason 默认为 bash 作为执行环境。一般需要指定 runtime 为 bun 使用 ts 完成更为方便的分析。

有时候，直接用 `act` 尝试然后用 `observe` 看结果，比在 `reason` 中反复推演更高效——尤其是在 git 可撤回的前提下。

## act — 改变世界

用 `act` 执行改变环境状态的操作：

- 跑测试：`act({ script: "bun test" })`
- 构建：`act({ script: "bun run build" })`
- Git 操作：`act({ script: "git add . && git commit -m \"msg\"" })`
- 安装依赖：`act({ script: "bun install" })`

## 关键原则

- **自由批量调用**：三个工具可以在同一个响应中并行调用。
- **observe 和 reason 始终安全**——不修改状态，放心使用。
- **act 需要谨慎**——行动前考虑可逆性。
- write 总是 可以与 observe/reason/act 同批发出，不等待结果。比如 write 后 同一批调用tsc 或者使用 act 执行脚本等。

## 工具偏好

- 优先用 `rg`（ripgrep）而非 `grep`——更快、默认递归、自动尊重 `.gitignore`。
- 注意 `rg` 的 or `|` 不需要转义，使用 `rg "A|B"` 而不是 `rg "A\|B"`
- 在脚本内处理输出——过滤、总结、格式化后再打印。避免倾倒大段原始输出。
- 复杂数据处理用 `bun`（解析 JSON、过滤数组、生成结构化摘要），不要链式拼接 shell 命令。
- 简单命令（`git status`、`ls`）直接用默认 shell。
- 第三方库隔离安装（临时目录、`uv` for Python），不污染主项目依赖。
