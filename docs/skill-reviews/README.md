# Skill 评论文档

对所有已知 skill 的逐个评审。分类术语定义见 [skill-taxonomy.md](../skill-taxonomy.md)。

每个评论包含：A. 类型组成（按分类体系标注）、B. 作用与核心思想、C. 与执行工具和 progress 的结合潜力。

## 目录

### [bug-diagnosis/](./bug-diagnosis/) — Bug 诊断与修复

| Skill | 来源 | 要点 |
|-------|------|------|
| [bugfix](./bug-diagnosis/bugfix.md) | builtin | 8步诊断 SOP，progress 格式化退出条件 |
| [diagnose](./bug-diagnosis/diagnose.md) | mattpocock | 6阶段循环，核心是"构建反馈循环" |

### [coding/](./coding/) — 编码、测试与审查

| Skill | 来源 | 要点 |
|-------|------|------|
| [coding](./coding/coding.md) | builtin | 编码实践规则集（标记/错误处理/抽象/注释） |
| [tdd](./coding/tdd.md) | mattpocock | 红绿重构 + 纵向切片 + deep module |
| [review](./coding/review.md) | mattpocock (in-progress) | 双轴 review：Standards + Spec |

### [architecture/](./architecture/) — 重构与架构

| Skill | 来源 | 要点 |
|-------|------|------|
| [refactor](./architecture/refactor.md) | builtin | 6步重构 SOP，安全网先行 |
| [improve-codebase-architecture](./architecture/improve-codebase-architecture.md) | mattpocock | 浅模块→深模块，depth/seam/deletion-test 概念体系 |

### [interaction/](./interaction/) — 交互协议与输出调制

| Skill | 来源 | 要点 |
|-------|------|------|
| [research](./interaction/research.md) | user | 高频 working + 证据链条 + blocked 审阅 |
| [step](./interaction/step.md) | user | research 的泛化版，任何场景适用 |
| [caveman](./interaction/caveman.md) | mattpocock | 极度压缩输出，减少 ~75% token |
| [zoom-out](./interaction/zoom-out.md) | mattpocock | 一句话指令：上升一层抽象 |
| [grill-me](./interaction/grill-me.md) | mattpocock | 穷举式提问，反转角色 |

### [planning/](./planning/) — 需求澄清与任务规划

| Skill | 来源 | 要点 |
|-------|------|------|
| [grill-with-docs](./planning/grill-with-docs.md) | mattpocock | 挑战式问答 + CONTEXT.md + ADR 维护 |
| [to-prd](./planning/to-prd.md) | mattpocock | 对话上下文 → PRD 文档 |
| [to-issues](./planning/to-issues.md) | mattpocock | 计划 → 纵向切片 issue |
| [triage](./planning/triage.md) | mattpocock | Issue 状态机分诊流程 |
| [prototype](./planning/prototype.md) | mattpocock | 一次性原型：逻辑分支 vs UI 分支 |

### [writing/](./writing/) — 写作

| Skill | 来源 | 要点 |
|-------|------|------|
| [writing-beats](./writing/writing-beats.md) | mattpocock (in-progress) | 逐 beat 推进，用户在每个转折点选方向 |
| [writing-fragments](./writing/writing-fragments.md) | mattpocock (in-progress) | 挖掘式对话产出碎片原料 |
| [writing-shape](./writing/writing-shape.md) | mattpocock (in-progress) | 从原始素材塑形为成品文章 |

### [capability/](./capability/) — 能力扩展与外部工具

| Skill | 来源 | 要点 |
|-------|------|------|
| [ssh-remote](./capability/ssh-remote.md) | user | SSH 远程 GPU 服务器操作 |
| [ppio-web-search](./capability/ppio-web-search.md) | user | PPIO API 网页搜索 |
| [everything-cli](./capability/everything-cli.md) | user | Everything CLI 速查 |
| [annotation](./capability/annotation.md) | user | jq 读写 Markdown 批注 |
| [disk-cleanup](./capability/disk-cleanup.md) | user | 磁盘清理方法论 + 五级分类 |

### [project-setup/](./project-setup/) — 项目配置与版本控制

| Skill | 来源 | 要点 |
|-------|------|------|
| [git](./project-setup/git.md) | builtin | Git 工作流规范 |
| [git-guardrails-claude-code](./project-setup/git-guardrails-claude-code.md) | mattpocock | Hook 拦截危险 git 命令 |
| [setup-pre-commit](./project-setup/setup-pre-commit.md) | mattpocock | Husky + lint-staged 配置 |
| [setup-matt-pocock-skills](./project-setup/setup-matt-pocock-skills.md) | mattpocock | 引导式项目配置脚手架 |

### [meta/](./meta/) — Skill 编写与会话交接

| Skill | 来源 | 要点 |
|-------|------|------|
| [write-a-skill](./meta/write-a-skill.md) | mattpocock | 如何编写 skill 的方法论 |
| [handoff](./meta/handoff.md) | mattpocock | 压缩对话为交接文档 |
