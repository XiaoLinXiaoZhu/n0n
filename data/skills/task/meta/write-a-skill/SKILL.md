---
name: write-a-skill
description: 编写新的 agent skill。引导收集需求、起草 SKILL.md、审查质量。当用户说"写一个 skill"、"创建 skill"时使用。
activation: manual
---

# Write A Skill

编写一个新的 agent skill。

## 流程

### 1. 收集需求

用 `progress(blocked)` 逐项询问：

- 这个 skill 覆盖什么任务/领域？
- 具体使用场景是什么？
- 需要可执行脚本还是只需要指令？
- 有参考素材吗？

### 2. 起草 skill

创建目录和文件：

```
skill-name/
├── SKILL.md           # 主指令（必需）
├── REFERENCE.md       # 详细文档（如需要）
└── scripts/           # 工具脚本（如需要）
```

### 3. Description 写法

description 是模型决定是否加载 skill 的**唯一信号**。必须包含：

1. 第一句：做什么
2. 第二句："当...时使用"（列出具体触发词和场景）

不超过 1024 字符。用第三人称。

### 4. 内容原则

- 读者是 agent——用祈使句下指令，不写面向人类的解释
- 每个步骤明确关联工具（observe/reason/act）和 progress 状态
- 退出条件用 progress 格式模板定义
- 使用中文

### 5. 何时拆分文件

- SKILL.md 内容过长或有独立的领域知识 → 拆到 REFERENCE.md
- 确定性操作（验证、格式化）需要重复执行 → 放 scripts/

### 6. 审查

用 `progress(blocked)` 呈现草案，请用户审阅。检查清单：

- [ ] description 包含触发条件
- [ ] 无时间敏感信息
- [ ] 术语一致
- [ ] 有具体的 progress 格式模板
- [ ] 引用只一层深（SKILL.md → REFERENCE.md，不再嵌套）

**退出 → 提交 `progress(completed)`**，包含 skill 路径和概要。
