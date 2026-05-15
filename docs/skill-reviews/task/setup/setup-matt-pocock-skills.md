# setup-matt-pocock-skills (mattpocock)

> 来源：mattpocock/skills/engineering | 激活：auto（disable-model-invocation: true）

## A. 类型组成

**Methodology**（主要，配置脚手架类型）。引导式的项目配置流程。

## B. 作用与核心思想

为其他 engineering skill 搭建配套配置：issue tracker 选择、triage 标签映射、领域文档布局。

5 步流程：Explore（探索当前状态）→ Present and ask（逐个确认三项配置）→ Confirm and edit（展示草案让用户修改）→ Write（写入文件）→ Done。

三项配置：
- **Issue tracker**——GitHub / GitLab / 本地 markdown / 其他
- **Triage labels**——五个状态角色到实际标签字符串的映射
- **Domain docs**——单上下文 vs 多上下文布局

关键设计：**一次一项配置**，不一次性抛出所有选项。每项先解释"这是什么、为什么需要、选不同有什么影响"，再让用户选择。

核心思想：**把复杂的一次性配置分解为一系列简单选择**。这本质上是 cursor plan 模式的具体应用——模型产出划分草案（配置选项），人在上面编辑。

## C. 与执行工具和 progress 的结合潜力

**高潜力（如果我们需要类似的引导式配置）**。

当前模式天然映射：
- Explore → observe（git remote, 现有配置文件）
- 每项配置 → progress(blocked)（呈现选项，等用户选择）
- Write → write/edit（写配置文件）
- Done → progress(completed)

**值得借鉴的内容**：引导式配置的交互模式——不是一次性问完所有问题，而是"解释→选择→确认"的小循环。这个模式可以用于我们自己的 `n0n-skill init` 或其他初始化流程。

## 人类评价

这个实际上属于 task 类型了，或者应该叫做 boost task。

感觉可以学习一下，然后我们开新项目的时候可以用用。

而且可以加上我的ts 偏好：

代码使用 monorepo

apps/xxx
和
packages/xxx

自然分层。

## AI 回应

确认归为 **Task**（一次性配置任务）。"引导式配置"的交互模式（解释→选择→确认的小循环）值得学习。

**关于 monorepo 偏好**：可以做一个类似的 project-init task skill，包含你的 TS monorepo 偏好（apps/xxx + packages/xxx 分层、bun workspace 等）。在开新项目时 @project-init 直接脚手架化。这比每次手动说明偏好更高效。