# IE 驱动提示词体系 — n0n 项目文档

## 概述

将 DFMEA（设计失效模式与影响分析）方法论引入 n0n agent 系统的提示词/skill 设计。

n0n 是一个编码 agent，接收用户请求，通过 LLM + 工具链完成任务。从工业工程的视角，n0n 是一条**产线**。当前系统的提示词组织是将基础规则放在 system、将 init skill 作为独立 user 消息发送——它"能工作"，但有结构性缺陷。IE 提供的正是解决这些缺陷的组织方式。

**本次修订的核心**：引入 self-function 体系（F0-F5 共 6 个 IE 驱动功能文档）替代现有的碎片 standard skill。F0 作为"用户动态约束容器"统一处理用户加载的 task/directive/capability skill。

## 文档索引

| 文档 | 内容 |
|------|------|
| [背景](background.md) | 现有系统的问题诊断 |
| [目标](goals.md) | 设计目标、6 条关键原则 |
| [方法论](methodology.md) | IE/DFMEA 在编码 agent 中的应用、S/O/D 评分锚点 |
| [VOC分析](voc-analysis.md) | 9 组 VOC（用户反馈 + 网络搜索 + skill 反推） |
| [CTQ与功能定义](ctq-and-functions.md) | VOC→CTQ→6 功能 (F0-F5)→25 子功能 的完整推导 |
| [DFMEA表格](dfmea-table.md) | 25 子功能 × 31 失效链完整分析 |
| [覆盖性校验](coverage-check.md) | 85 个现有 skill → F0-F5 的逐条映射与盲区诊断 |
| [思考流程规格](thinking-spec.md) | 6 步流程（含 F0 处理） + 边界裁定 |
| [实施规划](implementation-plan.md) | self-function 体系实施步骤、预演、目录结构变更 |

## 体系规模

6 个功能（F0-F5）、25 个子功能、31 条失效链。

## 核心架构：self-function 替代 standard

```
当前:  51 个碎片 standard skill → 散装规则
目标:   6 个 self-function (F0-F5) → 每个是一份完整的 IE 作业指导书
          含: 功能定义 + DFMEA 表格片段 + 预防措施 + 探测方式

F0 = 用户动态约束容器（task/directive/capability skill → 提取约束 → DFMEA 遍历）
F1 = 对抗捷径偏好（假设显式化 + 后果陈述 + 困难识别）
F2 = 暴露不确定性（歧义追问 + 关键告知 + 理解传播）
F3 = 安全执行操作
F4 = 代码正确可维护
F5 = 规范工具与通信
```

## 一句话结论

Agent 任务和工业生产共享同一个结构：**输入不完整、返工成本高、失效在交付后才被发现**。工业工程为这个结构积累了七十年的方法——把经验固化成功能-失效-措施的三层映射，让每次 LLM 调用（"新工人上岗"）读完文档就能达到合格线。
