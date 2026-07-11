---
alias: write-a-skill
description: 编写新的 agent skill。引导收集需求、起草 SKILL.md、审查质量。当用户说"写一个 skill"、"创建 skill"时使用。
activation: manual
---

# Write A Skill

编写一个新的 agent skill。

## 格式规范

### YAML Header（必需）

```yaml
---
description: <一句话描述。描述什么场景触发和能做什么。不超过 1024 字符。>
activation: <manual | init>
alias: <短名称，可选>
order: <加载顺序，仅 activation=init 时有效，可选>
---
```

- **description**：必填。描述 "when to use"（什么场景触发）和 "what it can do"（能做什么）。不超过 1024 字符。第三人称。
- **activation**：必填。`init` = 每次对话自动加载（需搭配 `order` 控制顺序），`manual` = 用户显式加载或匹配触发词时加载。默认 `manual`。
- **alias**：可选。短别名，用于 `n0n-skill read <alias>`。
- **order**：可选。仅 `activation=init` 时有效，数字越小越先加载。

### 目录结构

所有文件放在 skill 目录下，SKILL.md 同级：

```
skill-name/
├── SKILL.md           # 主指令（必需）
├── some-script.ts     # 辅助脚本（如需要）
├── reference.md       # 补充文档（如需要）
├── subdir/            # 有需要时可建子目录
└── ...
```

- 默认平铺在 SKILL.md 同级，但允许按需建子目录（如 `scripts/`、`docs/`）。
- 文件少时一切写进 SKILL.md，不拆分。

## 流程

### 1. 收集需求

用 `show(ask user question)` 逐项询问：

- 这个 skill 覆盖什么任务/领域？
- 具体触发场景和关键词是什么？
- 触发类型是哪种？——模型自动根据情景触发(manual)、用户手动触发、还是常驻规则(init)？
- 需要可执行脚本还是只需要指令？
- 有参考素材吗？

根据回答写出 description 草稿，确认触发条件覆盖准确后再继续。

### 2. 起草 SKILL.md

直接创建 `<skill-name>/SKILL.md`，写入 YAML header 和正文。

### 3. 内容原则

- 读者是 agent——用祈使句下指令，不写面向人类的解释。
- 每个步骤明确关联工具（observe/reason/act）和 show type。
- 退出条件用 `show(final report)` 格式模板定义。
- 使用中文。

### 4. 何时拆分文件

- SKILL.md 过长或涉及独立领域知识 → 拆到同级 reference 文件。
- 确定性操作（验证、格式化）需要复用 → 放同级脚本文件。

严禁深层引用（SKILL.md → reference.md，不再嵌套更多层）。

### 5. 审查

用 `show(ask user question)` 呈现草案，请用户审阅。检查清单：

- [ ] description 包含触发条件，覆盖用户场景
- [ ] activation 字段正确（init 需配 order，manual 需配触发词在 description 中）
- [ ] 无时间敏感信息（日期、版本号等容易过期的内容）
- [ ] 有正确的 show type 使用（中间步骤用 working log，最终步骤用 final report，需要用户决策时用 ask user question）
- [ ] 引用只一层深，附件平铺在同级目录

**退出 → 提交 `show(final report)`**，包含 skill 路径和概要。
