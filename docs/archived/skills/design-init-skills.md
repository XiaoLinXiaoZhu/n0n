# 设计文档：Init Skills — 将 System Prompt 拆解为 Skill

## 动机

当前 system prompt（code.md，~150 行）是一个大文件，包含 6 类不同职责的规则。改任何一条规则都要碰这个文件，而且与 coding/git skill 存在内容重复。

将 system prompt 拆解为多个 init skill，管理粒度从"一整个文件"降到"每组规则一个 skill 文件"。每个 skill 可以独立修改、版本控制、被用户覆盖。

## 新增 activation 类型：init

```
auto   — 出现在 help 列表，模型可自主发现和激活
manual — 对 help 隐藏，只能 @name 或 read 触发
init   — 启动时自动加载，拼接进 system prompt。不出现在 help 列表。可 @name 手动再次触发
```

### init 的行为

- 启动时：扫描 builtin-skills/ 和 skills/ 中 activation=init 的 skill，按 `order` 字段升序排列，将 body 拼接在空壳 system prompt 之后，形成完整的 system message
- help 列表：不显示 init skill（已加载，无需再发现）
- @name 触发：仍然可以手动触发（将 body 再次注入当前消息的 hint 中）。场景：长对话中模型"忘记"某条规则，用户手动提醒
- 覆盖：用户在 ~/.n0n/skills/ 中放同名 init skill 可覆盖 builtin 版本（与现有机制一致）

### order 字段

frontmatter 新增 `order` 字段（整数，可选，默认 50）。仅对 init skill 有意义。拼接时按 order 升序排列，order 相同时按 name 字母序。

留出间隔方便用户插入：

```
10 — workflow
20 — tool-usage
30 — coding
40 — safety
50 — communication
60 — git
```

## 元数据模型：SSOT（单一事实来源）

### name 从路径自动推导

`name` 不再写在 frontmatter 中，改为从 SKILL.md 相对于分类根目录的路径自动推导。

```
例：categoryDir = /skills/task, skillPath = /skills/task/review/init/SKILL.md
→ 相对路径 = review/init → name = review-init
```

好处：目录即身份，不存在 frontmatter 与目录名不一致的问题。重命名 skill 只需移目录，无需改文件内容。

### uid 自动生成

每个 skill 在扫描时自动生成唯一标识符（`uid`），与路径和文件名无关。即使 skill 被移动或重命名，uid 保持稳定，便于追踪和引用。

### alias 便捷别名

frontmatter 新增可选 `alias` 字段，支持 `string | string[]`，用于提供替代名称。用户在 `@name` 触发时可按别名查找，降低记忆负担。

```yaml
---
alias: [快速修复, hotfix]
---
```

### category 从目录推断

skill 的分类（`category`）从扫描根目录的子目录名推断，frontmatter 中无需声明。

- `data/skills/standard/` → category = "standard"（init 类型，自动加载）
- `data/skills/task/` → category = "task"（manual 类型，@name 触发）
- `data/skills/directive/` → category = "directive"（manual 类型）
- `data/skills/capability/` → category = "capability"（manual 类型）

### 影响

- **无 name 字段**：所有 SKILL.md 不再写 `name`，消除目录名不匹配的校验代码
- **无重复声明**：`category` 由位置决定，`activation` 在 standard 中可省略（默认为 init）
- **唯一入口**：目录结构 = 元数据声明，一次修改、处处生效

## 拆解方案

### 空壳 system prompt（保留在 code.md 中）

只包含不可拆的最小核心（~15 行）：

```markdown
You are an interactive agent that helps users with software engineering tasks.
If an AGENTS.md file exists in the workspace root, its project-specific instructions take precedence.

# System

- Your internal reasoning is invisible to the user. Only content submitted via the `progress` tool is delivered as a push notification.
- You are evaluated on task completion, code quality, and efficiency.
- Tool calls in a single response execute sequentially with no conflicts — always batch as many as possible.
- Messages wrapped in `<system-reminder>...</system-reminder>` are system-level guidance. Do not reply to their content.

# Tools

You have these tools: `observe` (read/search, no side effects), `reason` (think concretely, no side effects), `act` (change state), `progress` (report to user), `write` (create file), `edit` (modify file).

# Skills

Some of your behavior rules are loaded from init skills. You can also load additional skills on demand — use `n0n-skill read <name>` when a task matches a skill's description.
```

### Init Skills（data/skills/standard/）

| order | name | 内容 |
|-------|------|------|
| 10 | workflow | 核心循环（read→implement→verify→iterate）、协作姿态、失败处理、不给时间估计 |
| 20 | observe-reason-act | 三工具详细说明、思维实验、批量调用原则、工具偏好（rg/bun/隔离安装） |
| 25 | write-and-edit | write/edit 工具说明、文件操作选择策略、system-hint 说明 |
| 30 | progress-usage | progress 三状态详则、使用节奏（高频 working、blocked 前先探索）、汇报质量要求 |
| 40 | coding | 改动标记、错误处理、抽象原则、注释哲学、测试约束（禁改测试、禁浅断言） |
| 50 | safety | 可逆性评估、危险操作列表、不走捷径、环境限制（不sudo、.temp、bun进程） |
| 60 | communication | 中文、直白风格、引用格式、理解用户反馈（分类问题/纠正/假设/指令） |
| 70 | git | 分支与提交规范、操作技巧（写文件避免引号、代理端口） |

### Skill 存放位置与目录约定

所有 builtin skill 统一存放在 `data/skills/`，作为 n0n-skill 和 code 的共同资产。按类型分目录，**目录即类型**——`name` 从路径自动推导（参见上方 SSOT 模型），`category` 根据目录名称推断，`activation` 在 standard 目录下默认为 init（可省略）。frontmatter 中无需写 `name`、`category` 和 `activation`，只需写 `description`（和可选的 `alias`、`order`、`license`）。用户覆盖时只需同名目录即可匹配。

```
data/skills/
├── standard/        ← 启动时自动加载（init 类型），拼接进 system prompt
│   ├── workflow/
│   ├── observe-reason-act/
│   ├── write-and-edit/
│   ├── progress-usage/
│   ├── coding/
│   ├── safety/
│   ├── communication/
│   └── git/
├── task/           ← 具体任务的 SOP，需用户 @name 指派
│   ├── bugfix/
│   ├── refactor/
│   └── ...（后续添加的 task skill）
├── directive/      ← 交互行为调制，需用户 @name 触发
│   └── ...（research, zoom-out, grill-me 等）
└── capability/     ← 能力扩展，需用户 @name 触发
    └── ...（ssh-remote, ppio-web-search 等）
```

`apps/n0n-skill/builtin/` 不再作为 skill 源目录。init 命令的源目录更新为 `data/skills/`。

## 代码改动清单

| 改动项 | 文件 | 状态 |
|--------|------|------|
| SkillActivation 加 "init" | `packages/shared/src/skills/types.ts` | 已完成 |
| SkillMeta 加 order 字段 | `packages/shared/src/skills/types.ts` | 已完成 |
| name 改为从路径自动推导（deriveNameFromPath） | `packages/shared/src/skills/discovery.ts` | 已完成 |
| SkillMeta 加 alias 字段（frontmatter string\|string[]） | `packages/shared/src/skills/types.ts` + `discovery.ts` | 已完成 |
| SkillMeta 加 category 字段（从目录推断） | `packages/shared/src/skills/types.ts` + `discovery.ts` | 已完成 |
| SkillMeta 加 uid 字段（自动生成，不依赖路径） | `packages/shared/src/skills/types.ts` + `discovery.ts` | 已完成 |
| zod schema 加 "init" + order | `packages/shared/src/skills/discovery.ts` | 已完成 |
| help 命令过滤 init | `apps/n0n-skill/src/commands/help.ts` | 已完成 |
| repl 加载 init skills 拼接 system prompt | `apps/code/src/repl.ts` | 已完成 |
| 空壳 system prompt | `apps/code/src/prompts/code.md` | 已完成 |
| init 命令源目录改为 data/skills/ | `apps/n0n-skill/src/commands/init.ts` | 已完成 |
| init skills 文件 | `data/skills/` | **已完成** |
| 删除旧 builtin 目录 | `apps/n0n-skill/builtin/` | 已完成 |
| z.coerce.number for order | `packages/shared/src/skills/discovery.ts` | 已完成（额外修复：YAML 返回字符串需要 coerce） |
| 新增 loadSkillContentWithMeta（避免重复扫描） | `packages/shared/src/skills/discovery.ts` | 已完成 |
| 新增 findSkillsByNameOrAlias（支持别名查找） | `packages/shared/src/skills/discovery.ts` | 已完成 |

## 拼接示意

```
┌─────────────────────────────┐
│  code.md 空壳 (~15行)        │  ← 不可拆的最小核心
├─────────────────────────────┤
│  workflow (order:10)         │
├─────────────────────────────┤
│  observe-reason-act (order:20)│
├─────────────────────────────┤
│  write-and-edit (order:25)   │
├─────────────────────────────┤
│  progress-usage (order:30)   │
├─────────────────────────────┤
│  coding (order:40)           │
├─────────────────────────────┤
│  safety (order:50)           │
├─────────────────────────────┤
│  communication (order:60)    │
├─────────────────────────────┤
│  git (order:70)              │
├─────────────────────────────┤
│  [用户自定义 init skills]     │
└─────────────────────────────┘
         ↓ 拼接为一个 system message
┌─────────────────────────────┐
│  { type: "system",           │
│    content: 拼接结果 }        │
└─────────────────────────────┘
         ↓ 之后是
┌─────────────────────────────┐
│  cache_breakpoint            │
│  context fewshot             │
│  用户消息                     │
└─────────────────────────────┘
```
