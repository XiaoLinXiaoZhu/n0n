# IE 驱动提示词体系 — n0n 项目文档

## 概述

将 DFMEA（设计失效模式与影响分析）方法论引入 n0n agent 系统的提示词/skill 设计。

n0n 是一个编码 agent，接收用户请求，通过 LLM + 工具链完成任务。从工业工程的视角，n0n 是一条**产线**。当前提示词只在 system 中保留角色定义，长期行为标准由 init skill 作为独立 user 消息发送，运行时协议随当前请求发送。IE 提供的是这些行为标准的组织与验收方法。

**当前实现**：以一份可索引的 Self-Function 生产质量标准约束每份客户订单。
标准从委托关系、阶段证据链、风险、沟通和质量终态推导要求，不再按历史失效倾向拆成 F0-F5，
也不把工具、项目或模型偏好写成质量条款。

## 文档索引

当前规范与重建记录：

| 文档 | 内容 |
|------|------|
| [Self-Function ground truth](self-function-ground-truth.md) | 当前上位概念基准 |
| [重建 2 推导记录](rebuild-2/00-derivation-record.md) | 从 ground truth 到关系模型和现行标准的推导 |
| [现行标准入口](rebuild-2/01-self-function-standard-draft.md) | 指向唯一运行时规范正文 |
| [重建 2 Review 导航](rebuild-2/02-review-guide.md) | 关系追踪、边界案例和实现审查顺序 |
| [实现偏好](rebuild-2/03-implementation-preferences.md) | 工具、项目、编辑、隔离和模型适配的非规范性偏好 |
| [show 类型关系推导](rebuild-2/04-show-type-derivation.md) | 从四类最小协议核到八个机器可辨叶子的推导与边界 |
| [IE-AI 功能约束分享报告](rebuild-2/05-ie-ai-functional-constraints.md) | 面向其他 AI 系统的通用推导、分层、迁移和验证方法 |

以下文档是旧 F0-F5 方案的历史工程输入，不再描述当前规范或运行时：

| 文档 | 历史内容 |
|------|----------|
| [背景](background.md) | 现有系统的问题诊断 |
| [目标](goals.md) | 设计目标、6 条关键原则 |
| [方法论](methodology.md) | IE/DFMEA 在编码 agent 中的应用、S/O/D 评分锚点 |
| [VOC分析](voc-analysis.md) | 9 组 VOC（用户反馈 + 网络搜索 + skill 反推） |
| [CTQ与功能定义](ctq-and-functions.md) | VOC→CTQ→6 功能 (F0-F5)→25 子功能 的完整推导 |
| [DFMEA表格](dfmea-table.md) | 25 子功能 × 31 失效链完整分析 |
| [覆盖性校验](coverage-check.md) | 85 个现有 skill → F0-F5 的逐条映射与盲区诊断 |
| [思考流程规格](thinking-spec.md) | 6 步流程（含 F0 处理） + 边界裁定 |
| [实施规划](implementation-plan.md) | self-function 体系实施步骤、预演、目录结构变更 |

## 当前结构

- 唯一质量标准：`data/skills/self-function/production-quality/SKILL.md`
- 条件化运行时偏好：`data/skills/directive/implementation-preferences/SKILL.md`
- 用户可见消息：record、request、delivery、non-delivery 四类协议核，展开为八个机器可辨叶子
- 工具和项目事实：由工具接口、运行时协议和项目上下文分别提供

## 一句话结论

Agent 任务和工业生产共享同一个结构：**输入不完整、返工成本高、失效在交付后才被发现**。
因此应先建立委托、责任、阶段、证据和验收关系，再由这些关系推导质量要求，
而不是为每个历史摩擦点追加一条孤立规则。
