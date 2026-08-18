# Skill 加载链路实证（工程记录）

本文用途：记录 skill 从磁盘进入模型上下文的完整链路，作为 `00-ground-truth.md` 全部结论的证据来源。本文是工程记录层文档，不注入运行时。每条结论都指向具体的文件与行号，可独立核对。

核对基准：仓库分支 `mvp`，本文所有行号已逐条对照源文件复核。代码变动后需重新核对。

## 一、四条通道总览

| 通道 | 谁触发 | 内容落在提示词的哪个位置 | 每轮是否重现 | 当前数量 |
|------|--------|------------------------|------------|---------|
| init | 系统，无人可选 | system 消息之后一条独立的 `role:"user"` 消息 | 是 | 8 |
| `@name` | 用户键入 | 该轮 user 消息内，`<user-request>` 之前 | 否，只在被引用的那一轮 | 按需 |
| `n0n skill read` | agent 自己执行命令 | `role:"tool"` 的工具返回 | 否 | 按需 |
| auto | agent 从 help 列表自行发现 | 同上（发现后仍走 read） | 否 | 0 |

## 二、共同的前段：发现与装载

三个环节对四条通道完全一致，差异只发生在最后的拼装环节。

**发现**：`packages/skills/src/scanner.ts:65-66` 遍历四个固定分类子目录（`SKILL_CATEGORIES`，见 `packages/skills/src/types.ts:22-27`），用 `**/SKILL.md` 递归匹配。分类不来自 frontmatter，而是由所在目录推断——`discoverSkillsInCategory` 的 `category` 参数由遍历循环传入。

**扫描根目录**：`apps/n0n-skill/src/paths.ts:32` 返回两个根——`~/.n0n/builtin-skills/` 与 `~/.n0n/skills/`，builtin 在前。`packages/skills/src/scanner.ts:73-77` 的函数注释明确写"不覆盖，保留全部"、"当同名 skill 出现在多个根目录时，每个都被保留"。

**解析**：`packages/skills/src/parser.ts:50-57` 的 `SkillFrontmatterSchema` 是 frontmatter 的唯一契约，共六个字段：`alias`、`description`、`license`、`compatibility`、`activation`（`parser.ts:55`，默认 `auto`）、`order`（`parser.ts:56`，默认 50）。另有 `metadata` 嵌套块，由 `parser.ts:127` 单独提取。zod object 默认丢弃未知字段，因此写在 frontmatter 里的其他键不会报错，也不会生效。

`name` 不来自 frontmatter，由 `packages/skills/src/parser.ts:73-84` 从目录相对路径推导，路径分隔符换成连字符——`task/mattpocock-workflow/plan/SKILL.md` 得到 `mattpocock-workflow-plan`。

**装载**：`packages/skills/src/loader.ts:94-102` 递归收集 skill 目录下所有非 `SKILL.md` 的 `.md` 作为 resources，`packages/skills/src/loader.ts:85-92` 收集 `scripts/` 下的可执行文件。递归是无条件的，实测 `mattpocock-workflow` 父 skill 的 resources 包含子 skill 目录下的 5 份 `init/references/*.md`。

## 三、通道一：init

`apps/n0n-skill/src/api.ts:69-80`。筛选 `activation === "init"`（`api.ts:72`），按 `order` 升序、同 order 按 name 字典序排列（`api.ts:73`）。

`apps/code/src/repl/index.ts:92-97` 与 `apps/code/src/headless.ts:91,117-119` 将结果放入 `system_with_skill` 消息。

拼装发生在 `packages/format-prompt/src/index.ts:165-174`：基础 system prompt 成为 `role:"system"`，**skill 正文另起一条 `role:"user"` 消息**（同文件 `index.ts:172`），而不是并入 system 消息。随后 `mergeConsecutiveSystem` 只合并连续的 system 消息，不会把这条 user 消息并回去。

单个 skill 的包装形式见 `packages/format-prompt/src/format-skill.ts:18-31`：`<skill name="...">` 外层标签，内部以 `<!-- begin of skill x -->` 与 `<!-- end of skill x -->` 注释界定正文边界，scripts 与 resources 作为子标签附在正文之后。

当前 init skill 共 8 个：`self-function` 七章（order 50 至 200）与 `capability/git-proxy`（order 900）。

## 四、通道二：`@name`

**语法**：`apps/code/src/skill-inject.ts:26` 的 `SKILL_LINE_RE = /^@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)$/`。三个硬约束：必须独占一行（整行匹配）、名称只能是小写字母数字与连字符、首尾不得为连字符。行内提及不会触发。

**该行被移除**：`apps/code/src/skill-inject.ts:41-49` 把命中的行收进 `skillNames`，未命中的行收进 `cleanedLines`，最终 `skill-inject.ts:58` 返回的 `cleanedText` 不含 `@name` 行。也就是说 `@name` 不作为用户话语进入上下文，模型看不到用户"说过"这个词。

**查找不过滤 activation**：`apps/n0n-skill/src/api.ts:45-66` 的 `readSkills` 只按 name 或 alias 匹配（`packages/skills/src/resolver.ts:21-23`），不检查 activation。因此 init skill 也可被 `@` 引用，结果是同一份正文在一次请求中出现两遍。补全菜单则排除 init（`apps/code/src/multiline-input/mention.ts:32` 只保留 auto 与 manual），两处口径不一致。

**一个名字可能命中多份**：`resolver.ts:21-23` 同时匹配 name 与 alias，`api.ts:58-62` 对每个匹配项都装载。名称与别名互撞时全部注入。当前互撞 4 例（`writing-beats`、`writing-fragments`、`writing-shape`、`record`，它们的 alias 与自身 name 相同）。

**位置**：`packages/format-prompt/src/index.ts:78-96` 的 `buildUserInputContent`。该函数的文档注释写明排列顺序为"由远及近，尾部获得最强注意力"：

1. `context` — 环境背景（仅首次）
2. `mentionedSkills` — 用户引用的 skill，注释原文标注为"规则/约束层"（`packages/format-prompt/src/index.ts:87-89`）
3. `<user-request>` — 用户实际输入，注释原文标注为"意图层"（`packages/format-prompt/src/index.ts:91`）
4. `<system-hint>` — 系统行为引导，尾部锚定

**生命周期**：`packages/format-prompt/src/index.ts:244-253` 处理 `user_input` 时计算 `isLatestRound`，但该值只传给 `includeHint` 参数，用于决定是否保留 `<system-hint>`。同文件 `index.ts:87` 对 `mentionedSkills` 没有任何轮次判断。结论：被引用的 skill 正文永久保留在它被引用的那一轮消息内，既不会被剥离，也不会随对话推进重新前移到尾部。

## 五、通道三：`n0n skill read`

`apps/n0n-skill/src/commands/read.ts`：按 name 或 alias 查找，`read.ts:37` 把正文打印到 stdout，随后附上脚本列表与资源绝对路径。

agent 通过 observe 执行该命令，输出经工具返回进入上下文，成为 `role:"tool"` 消息（`packages/format-prompt/src/index.ts:213-229`）。与通道二的差异不在内容，而在消息角色：通道二的内容位于 user 消息中用户请求的正上方，通道三的内容位于工具返回中。

## 六、通道四：auto

`apps/n0n-skill/src/commands/help.ts:14` 只列出 `activation === "auto"` 的 skill，`help.ts:36-38` 在末尾附引导语"在响应用户请求前，检查是否有合适的 skill 可以加载"。

当前 43 个 skill 中 auto 数量为 0：35 个 manual、8 个 init。可佐证的运行输出是每轮环境上下文中 `n0n skill` 的结果——"没有 auto 激活的 skill"。

即：自主发现通道的代码路径完整，但没有任何 skill 走这条路。agent 无法主动得知任何一个 skill 的存在，除非用户先告诉它。

## 七、已核实的口径不一致

以下为本次核对中发现的、文档与实现或实现内部不一致之处。它们是 `00-ground-truth.md` 第八节的证据来源。

| # | 现象 | 位置 |
|---|------|------|
| 1 | `category` 字段写在 8 份 SKILL.md 的 frontmatter 中，schema 不解析，被静默丢弃；真实分类由目录推断 | `parser.ts:50-57` 对照 `scanner.ts:65-66` |
| 2 | `function` 字段写在 7 份 self-function SKILL.md 中，同样不被解析 | 同上 |
| 3 | `write-a-skill` 声明 activation 取值为 `manual \| init`、默认 manual；实现为三值且默认 auto | `data/skills/task/meta/write-a-skill/SKILL.md:18,25` 对照 `parser.ts:55` |
| 4 | `write-a-skill` 要求"默认平铺在 SKILL.md 同级"、"严禁深层引用"；loader 无条件递归收集子目录 md | `data/skills/task/meta/write-a-skill/SKILL.md:42,75` 对照 `packages/skills/src/loader.ts:94-102` |
| 5 | `license`、`compatibility`、`metadata` 三个受支持字段零使用 | 全仓 43 份 SKILL.md 统计 |
| 6 | 4 个 skill 的 alias 与自身 name 完全相同，属冗余 | `resolver.ts:21-23` 使两者等效 |
| 7 | `@` 补全菜单排除 init，但 `@` 解析本身不排除 | `mention.ts:32` 对照 `api.ts:45-66` |
| 8 | `data/skills/TODO.md` 位于分类目录之外，扫描器不会读取；其内容按 `docs/ie/rebuild/04-handoff.md` 第七节自述已完全陈旧 | `scanner.ts:65-66` |
| 9 | `packages/skills/src/formatter.ts` 整个模块无调用点：`formatSkillContents` 与 `formatSkillSummaries` 在全仓（排除自身定义与 `index.ts` 再导出）搜索不到任何使用方，真实生效的拼装在 `packages/format-prompt/src/format-skill.ts`。`compatibility` 字段唯一的渲染位置就在这段死代码里 | `formatter.ts:21`、`formatter.ts:29-53` |
