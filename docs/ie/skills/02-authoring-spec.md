# Skill 编写规范（一）：元契约

本文用途：规定对全部四个分类都生效的 skill 编写要求。各分类各自的正文骨架见 `03-type-templates.md`。

地位：本文是 `00-ground-truth.md` 的下游产物。与它冲突的以它为准。本文中形如 `R8` 的引用指向该文的推论编号。

规范语言与 self-function 一致：**应**为强制要求，**不得**为强制禁止，**宜**为推荐做法，**可**为允许做法。条款编号稳定，供其他文档引用。

## S1 适用范围

**S1.1** 本文约束 SKILL.md 的 frontmatter、目录命名、职责边界、体量、附属文件与跨轮有效性声明。这些内容对四类 skill 完全一致，因此集中规定，不在各类模板中重复。

**S1.2** 本文不约束正文的组织结构与语气——那由分类决定，见 `03-type-templates.md`。

**S1.3** 本文不约束 skill 讲什么。内容的正确性由作者负责。

## S2 frontmatter：系统的唯一契约

**S2.1** 被解析的字段只有六个：`alias`、`description`、`license`、`compatibility`、`activation`、`order`，另有 `metadata` 嵌套块（`packages/skills/src/parser.ts:50-57`、`parser.ts:127`）。schema 之外的键被静默丢弃，不报错也不生效。**不得书写 schema 之外的字段。**

依据：当前有 8 份 SKILL.md 写了 `category`、7 份写了 `function`，全部无效。`category` 实际由所在目录推断（`packages/skills/src/scanner.ts:65-66`），写在 frontmatter 里既不生效也会误导读者以为它可配置。

**S2.2 `description`**：必填。**应**回答"什么情况下该引用我"，不得只回答"我是什么"。

依据：它出现在补全菜单（`apps/code/src/multiline-input/mention.ts:32`）与 help 列表中，服务的动作是用户回忆自己有哪些 skill 可用（`R4`）。介绍性的描述在那个时刻不提供任何决策信息。

**宜**控制在 80 字符以内，单行可读。现状分布：最短 5 字符，中位 59，最长 157。超过 100 字符的三份（`review-init`、`mattpocock-workflow-init`、`record`）在菜单中会被截断或折行。

**S2.3 `activation`**：**应**显式写出，不得省略。

依据：schema 默认值是 `auto`（`parser.ts:55`），省略等于声明"进入 help 列表、供 agent 自主发现"。这几乎从不是作者本意——当前 43 份中 0 份为 auto，说明所有作者都在依赖自己以为的默认值。

现阶段取值**应**为 `manual` 或 `init`。auto 通道虽保留，但自主边界尚未确定（`00-ground-truth.md` 第 7.1 节），在确定之前不新增 auto skill。

**S2.4 `order`**：`activation: init` 时必填，其余情况不得书写。

依据：`order` 只在装载 init skill 时参与排序（`apps/n0n-skill/src/api.ts:73`），写在别处不产生任何效果。现行占位：50 至 200 为 self-function 七章，900 为环境补充信息（`capability/git-proxy`）。新增 init skill **应**避开这两段，并在正文说明选取该值的理由。

**S2.5 `alias`**：可选。不得与自身 `name` 相同；不得与任何其他 skill 的 `name` 或 `alias` 相同。

依据：查找对 name 与 alias 一视同仁（`packages/skills/src/resolver.ts:21-23`），且一次引用会把全部命中项都装载（`apps/n0n-skill/src/api.ts:45-66`）。冲突的后果是一次 `@` 注入多份正文，而系统不做任何提示。当前有 4 份 skill 的 alias 与自身 name 完全相同（`writing-beats`、`writing-fragments`、`writing-shape`、`record`），属纯冗余。

**S2.6 `license`、`compatibility`、`metadata`**：不得使用。

依据：三者均无实际消费者。`metadata` 解析后无任何读取点；`license` 仅被存入元数据；`compatibility` 只在 `packages/skills/src/formatter.ts:21` 被拼接，而该函数在全仓找不到调用点。写它们不产生任何可观察的效果。

## S3 命名与可引用性

**S3.1** `name` 由 SKILL.md 所在目录相对于分类目录的路径推导，路径分隔符替换为连字符（`packages/skills/src/parser.ts:73-84`）。它**不能**由 frontmatter 指定。因此**目录名就是对外接口**，改目录名等于改接口。

**S3.2** 凡 `activation` 不为 `init` 的 skill，其推导出的 `name` **应**匹配 `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`。

依据：`@` 引用的正则是 `apps/code/src/skill-inject.ts:26`，只接受小写字母、数字与中间的连字符，且必须独占一行。含大写字母、下划线、点号或中文的目录名会导致该 skill **永远无法被引用**，且不会有任何报错——输入 `@Name` 时整行不被识别为引用，会作为普通文本留在请求里。

当前有 7 份 skill 命中该缺陷：`self-function` 的七章（`D0-general`、`D1-dialogue`、`D2-task-state`、`D3-information`、`D4-code`、`D5-environment`、`A-toolchain`），首字母大写。它们均为 init 常驻，不依赖 `@`，因此不构成实际故障，但新增 skill 不得重复这一形态。

**S3.3** 嵌套子目录产生的 `name` 是拼接结果（`task/mattpocock-workflow/plan/` → `mattpocock-workflow-plan`），整体须满足 S3.2。

**S3.4** 名字**宜**短到用户愿意手打。它是用户在引用时刻要输入的东西，不是文档标题。

## S4 职责边界与体量

**S4.1** 一份 skill **应**对应"用户会反复说出口的一件事"（`R8`）。一份用户从不会整段说出口的 skill，边界划错了——它要么该拆开，要么不该是 skill。

**S4.2** skill 之间的职责**应**互斥（`R6`）。新增之前**应**检索是否已有 skill 覆盖同一件事；覆盖同一件事而要求不一致时，系统不会报错，只会让 agent 在两条规则之间随机选一条。

**S4.3** 不得假设自己是该 `name` 下的唯一内容（`R12`）。用户目录与内置目录的同名 skill 会被一同注入，这是有意的叠加语义（`packages/skills/src/scanner.ts:73-77`）。因此正文不得写"本 skill 是关于 X 的全部规定"这类排他性表述。

**S4.4** 体量**应**与通道匹配：

| 通道 | 开销性质 | 建议上限 |
|------|---------|---------|
| `init` | 每轮固定，永久占用上下文最前端 | 150 行 |
| `manual` | 单次注入，随该轮消息保留 | 200 行 |

超过上限时**应**拆分：主 skill 保留触发条件与总体流程，细节下沉为子 skill 或附属资源。

**S4.5** `init` skill **应**自包含，不得引用 agent 看不到的外部文档。

依据：它在每轮开始时无条件生效，此时 agent 尚未做任何读取。引用一份未注入的文档等于把条款悬空。

## S5 附属文件

**S5.1** `scripts` 与 `resources` 注入的是**路径列表，不是内容**（收集见 `packages/skills/src/loader.ts:85-102`，拼装见 `packages/format-prompt/src/format-skill.ts:18-31`）。agent 需要额外一次读取才能拿到内容。因此**关键要求不得只写在附属文件里**——正文必须能独立成立。

**S5.2** skill 目录下所有非 SKILL.md 的 `.md` 会被**递归**收集为 resources（`packages/skills/src/loader.ts:94-102`）。含有子 skill 的目录**不宜**再放置 md 资源，否则子目录的资源会被父 skill 一并列出。

依据：实测 `mattpocock-workflow` 父 skill 的 resources 里包含了子 skill 的 5 份 `init/references/*.md`，这些文件与父 skill 无关。

**S5.3** `scripts/` 下的 `.ts`、`.js`、`.sh` 会被列为可执行脚本并附带运行方式（`packages/skills/src/loader.ts:85-92`）。非脚本文件不放入该目录。

## S6 跨轮有效性

**S6.1** 需要跨多轮持续生效的 skill **应**自带自维持机制——正文中明确要求 agent 在每一轮重新登记、复述或核对它的约束（`R5`）。

依据：被 `@` 引用的内容永久停留在被引用的那一轮消息里，不会随对话推进重新前移（`packages/format-prompt/src/index.ts:87`）。没有自维持机制时，它的影响力随轮次单调衰减，这是位置决定的，不是模型不守规矩。

**S6.2** 不具备自维持机制的 skill，正文**应**写明它只约束当前这一轮，不得让用户误以为引用一次即长期生效。

## S7 需要代码配合的待执行项

以下不是本规范的条款，是使规范可被机器检查所需的改动。列出供后续裁定，本轮不实施。

| 项 | 内容 | 消除的失效 |
|----|------|-----------|
| 1 | frontmatter schema 改为拒绝未知字段，或显式声明忽略 | S2.1 的违反当前完全静默 |
| 2 | 扫描时校验 name 是否可被 `@` 引用，不合规则告警 | S3.2 的违反当前无任何反馈 |
| 3 | 扫描时检测 alias 与 name 的跨 skill 冲突 | S2.5 的违反当前无任何反馈 |
| 4 | 清理 `license`、`compatibility`、`metadata` 或为其建立消费者 | 字段存在但无效果，持续误导作者 |
