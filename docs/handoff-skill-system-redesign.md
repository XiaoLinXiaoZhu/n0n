# Handoff: Skill 系统重设计

## 背景

本次会话对 n0n 项目的 Agent Skill 系统进行了一次完整的调研和重设计。起点是用户希望"进一步扩大 skill 的优势"，终点是产出了一套新的分类体系、目录结构、init skill 机制设计，以及全部 init skill 文件。

## 已完成的工作

### 1. 调研

- 阅读了用户的 7 个自定义 skill（`~/.n0n/skills/`）
- 克隆并逐个阅读了 mattpocock/skills 仓库全部 ~25 个 skill（`.temp/mattpocock-skills/`）
- 阅读了当前 4 个 builtin skill 和完整 system prompt（`apps/code/src/prompts/code.md`）
- 阅读了相关设计文档（`docs/design-skill-integration.md`、`docs/annotation-interaction-paradigm.md`、`docs/reference/Agent Skills/`）

### 2. 分类体系

产出 `docs/skill-taxonomy.md`——定义了四种 skill 类型：

| 类型 | 定义 |
|------|------|
| **Standard** | 无论做什么任务都适用的底层规则（coding、git） |
| **Task** | 指向具体任务的完整 SOP（bugfix、refactor、review...） |
| **Directive** | 改变模型交互行为模式（research、step、zoom-out...） |
| **Capability** | 赋予模型新的操作能力（ssh-remote、ppio-web-search...） |

### 3. 评审文档

`docs/skill-reviews/` 下按领域聚类：
- `topic/` — 7 个主题讨论（workflow、tool-usage、coding-and-testing、safety、communication、git-workflow、interaction-protocol），每个包含人类评价和 AI 回应
- `task/` — 8 组 task skill 评审 + `TODO.md` 重写计划
- `cap/` — 4 个 capability 评审

### 4. Init Skill 机制设计

产出 `docs/design-init-skills.md`——核心决策：

- system prompt 精简为 ~15 行空壳（工具列表 + AGENTS.md + skill 系统说明）
- 所有行为规则变成 init skill，启动时按 order 字段拼接进 system message
- 新增 `activation: init` 类型（启动加载、不出现在 help、可 @name 再次触发、用户可覆盖）
- 目录约定：`data/skills/init/` 下的 skill 一律为 init 类型

### 5. Skill 文件

`data/skills/` 已创建完整目录结构和文件：

```
data/skills/
├── standard/           ← 8 个 standard skill（启动时 init 加载）
│   ├── workflow/         (10) 任务执行原则
│   ├── observe-reason-act/ (20) 三工具详则
│   ├── write-and-edit/   (25) 文件操作工具
│   ├── progress-usage/   (30) progress 使用规范
│   ├── coding/           (40) 编码实践
│   ├── safety/           (50) 安全操作
│   ├── communication/    (60) 沟通规范
│   └── git/              (70) Git 工作流
├── task/           ← 2 个 task skill
│   ├── bugfix/     (manual) 待重写：融合 diagnose
│   └── refactor/   (auto) 待重写：融合显性遍历
├── directive/      ← 2 个 directive skill
│   ├── research/   (manual)
│   └── step/       (manual)
└── capability/     ← 空，后续按需添加
```

## 未完成的工作

### 代码改动（`docs/design-init-skills.md` 中的改动清单）

全部 9 项已完成（commit d774928）：
1. `packages/shared/src/skills/types.ts` — SkillActivation 加 "init"，SkillMeta 加 order 字段 → ✓ 已完成
2. `packages/shared/src/skills/discovery.ts` — zod schema 加 "init" + order → ✓ 已完成
3. `apps/n0n-skill/src/commands/help.ts` — help 命令过滤 init → ✓ 已完成（天然适配，无需额外代码）
4. `apps/code/src/repl.ts` — 加载 init skills 拼接 system prompt → ✓ 已完成
5. `apps/code/src/prompts/code.md` — 精简为空壳 → ✓ 已完成
6. `apps/n0n-skill/src/commands/init.ts` — 源目录改为 data/skills/ → ✓ 已完成
7. 删除旧 `apps/n0n-skill/builtin/` → ✓ 已完成

当前 handoff 会话中已完成全部代码改动，请参考 docs/design-init-skills.md 的最新状态。

### Task Skill 重写（`docs/skill-reviews/task/TODO.md`）

- bugfix：融合 diagnose 的反馈循环理念 + 多假设排名 + debug log 前缀 + 复盘
- refactor：融入显性遍历 + 基于实验 + 可选复杂度度量
- review：新建，拆为 review-init / review-spec / review-standards
- planning / writing / maintenance / setup / meta：按需添加

### Skill 内容审查

当前 init skill 和 directive skill 的内容需以"agent 是读者"视角通审一遍——本次会话中已发现 step skill 有面向人类的解释混入，其他 skill 可能存在类似问题。

## 关键决策记录

| 决策 | 理由 |
|------|------|
| skill 四分类（Standard/Task/Directive/Capability） | 用户提出 Task 概念区分"抽象标准"和"具体任务 SOP" |
| 目录即类型（standard/ task/ directive/ capability/） | 方便管理，读取时按目录判断类型 |
| bugfix 改为 manual | 修 bug 是具体任务，应由用户显式指派 |
| caveman 不采纳 | progress 系统已解决输出冗余问题 |
| git-guardrails-claude-code / setup-pre-commit 不采纳 | Claude Code 特有 / 与我们场景无关 |
| TDD 采用 AI TDD 模式 | 严格 Red-Green-Refactor 在 AI 场景下浪费上下文 |
| "禁止修改已有测试"写入 coding standard | 防止 AI 通过改测试"修复"失败 |
| step 核心约束融入 progress-usage standard skill | step 作为 directive 保留"加强版"角色 |
| communication 定位为中文用户 | 未来拓展时按用户语言切换，现在不做提前工作 |

## 建议下一个 session 使用的 skill

- `@coding` — 代码改动涉及 TypeScript 类型定义和模块修改
- `@step` — 代码改动涉及多个文件的联动修改，逐步验证更安全
