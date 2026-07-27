# 覆盖性校验：现有 Skill → Self-Function 映射（最终版）

## 当前状态

| 目录 | 状态 |
|------|------|
| `self-function/` | 已创建 6 个 SKILL.md（F0-F5），覆盖全部核心功能 |
| `standard/` | 待删除——内容已全部迁移 |
| `task/` | 不变 |
| `directive/` | 不变 |
| `capability/` | 新增 git-proxy（从 standard 迁移） |

## 一、Self-Function 内容来源映射

| Self-Function | 吸收的现有 standard skill | 新增内容 |
|---------------|-------------------------|---------|
| **F1-anti-shortcut** | workflow | F1.1 假设显式化、F1.2 后果陈述、F1.3 困难识别、F1.5 根因纠正（全部新增——现有 skill 无对应） |
| **F2-expose-uncertainty** | communication/feedback | F2.1 歧义追问、F2.2 关键决策告知（新增） |
| **F3-safe-operations** | safety/* (6) | 结构化为 DFMEA 表格 |
| **F4-code-quality** | coding-style + file-organization/* (5) + write/* (5) + no-search-and-replace + test-standard/* (9) + code-comment/* (7) = 共 28 个 | 结构化为 DFMEA 表格 + 补充失效模式 |
| **F5-tool-communication** | communication/* (6) + show-usage + exec/* (7) + git/commit-from-file + git/workflow = 共 16 个 | 结构化为 DFMEA 表格 |
| **F0-user-requirements** | —（全新） | F0.1-F0.3 全部新增 |

## 二、不再存在的盲区

迁移前（覆盖性校验 v1）：F1 有 4 个无覆盖子功能，F2 有 3 个无覆盖子功能。

迁移后：**零盲区**。所有 25 个子功能（F0:3 + F1:5 + F2:4 + F3:4 + F4:5 + F5:4）在 self-function 文档中都有对应的失效模式、预防措施和探测方式。

## 三、内容合并效果

| 指标 | 迁移前 | 迁移后 |
|------|--------|--------|
| Init skill 文件数 | 51 | 7（6 self-function + git-proxy） |
| 碎片 skill (<64 tokens) | 14 个 | 0 个 |
| DSA 128-token 块内聚性 | 差 | 好——每个 F 是长文档 |
| F1/F2 覆盖 | 几乎空白 | 完整（7 个新增子功能） |
| 功能-措施可追溯性 | 无（靠名称猜测） | 完全（F → 子功能 → 失效 → 措施链） |

## 四、验证：是否每个 standard skill 都有归属

逐条核对 51 个 standard skill：

| Skill | → | Self-Function | 子功能 |
|-------|---|--------------|--------|
| safety/reversibility | → | F3-safe-operations | F3.1 |
| safety/dangerous-ops | → | F3-safe-operations | F3.2 |
| safety/no-shortcut | → | F3-safe-operations | F3.3 |
| safety/no-sudo | → | F3-safe-operations | F3.4 |
| safety/bun-process | → | F3-safe-operations | F3.4 |
| safety/temp-dir | → | F3-safe-operations | F3.4 |
| coding-style | → | F4-code-quality | F4.1, F4.2 |
| file-organization/principles | → | F4-code-quality | F4.2 |
| file-organization/split-signals | → | F4-code-quality | F4.2 |
| file-organization/split-dimensions | → | F4-code-quality | F4.2 |
| file-organization/dir-upgrade | → | F4-code-quality | F4.2 |
| file-organization/dir-structure | → | F4-code-quality | F4.2 |
| write/declarative | → | F4-code-quality | F4.3 |
| write/tool | → | F4-code-quality | F4.3 |
| write/decision-tree | → | F4-code-quality | F4.3 |
| write/diff-patch | → | F4-code-quality | F4.3 |
| write/token-signal | → | F4-code-quality | F4.2 |
| no-search-and-replace | → | F4-code-quality | F4.3 |
| test-standard/core-constraints | → | F4-code-quality | F4.4 |
| test-standard/properties | → | F4-code-quality | F4.4 |
| test-standard/structure | → | F4-code-quality | F4.4 |
| test-standard/naming | → | F4-code-quality | F4.4 |
| test-standard/factory | → | F4-code-quality | F4.4 |
| test-standard/mock-construction | → | F4-code-quality | F4.4 |
| test-standard/file-org | → | F4-code-quality | F4.4 |
| test-standard/utils-scope | → | F4-code-quality | F4.4 |
| test-standard/coverage | → | F4-code-quality | F4.4 |
| test-standard/tools | → | F4-code-quality | F4.4 |
| code-comment/why | → | F4-code-quality | F4.5 |
| code-comment/should-write | → | F4-code-quality | F4.5 |
| code-comment/shouldnt-write | → | F4-code-quality | F4.5 |
| code-comment/source-of-truth | → | F4-code-quality | F4.5 |
| code-comment/tag-table | → | F4-code-quality | F4.5 |
| code-comment/tag-format | → | F4-code-quality | F4.5 |
| code-comment/doc-sync | → | F4-code-quality | F4.5 |
| communication/language | → | F5-tool-communication | F5.4 |
| communication/no-emoji | → | F5-tool-communication | F5.4 |
| communication/plain-language | → | F5-tool-communication | F5.4 |
| communication/progressive-disclosure | → | F5-tool-communication | F5.4 |
| communication/reference | → | F5-tool-communication | F5.4 |
| communication/feedback | → | F2-expose-uncertainty + F5-tool-communication | F2.3, F5.4 |
| show-usage | → | F5-tool-communication | F5.1 |
| exec/observe | → | F5-tool-communication | F5.2 |
| exec/reason | → | F5-tool-communication | F5.2 |
| exec/act | → | F5-tool-communication | F5.2 |
| exec/batch | → | F5-tool-communication | F5.2 |
| exec/grep | → | F5-tool-communication | F5.2 |
| exec/data-processing | → | F5-tool-communication | F5.3 |
| exec/isolated-install | → | F5-tool-communication | F5.2 |
| git/commit-from-file | → | F5-tool-communication | F5.2 |
| git/workflow | → | F5-tool-communication | F5.2 |
| workflow | → | F1-anti-shortcut | F1.4 |
| git/proxy | → | capability/git-proxy | — |

**51/51 有明确归属。零遗漏。**

## 五、Task / Directive / Capability Skills 处理

34 个 task/directive/capability skill 不迁移内容。通过 F0-user-requirements 动态处理——每轮提取约束 → DFMEA 遍历 → 自检。

建议后续为这些 skill 的 frontmatter 补充 `f0_constraints` 字段，使约束提取更可靠（而非依赖 body 文本解析）。
