# 实施规划：self-function 体系 + F0

## 最终目录结构

```
data/skills/
  self-function/                     ← 新：IE 驱动的功能文档
    F0-user-requirements/SKILL.md    ← 用户动态约束容器 (order=500)
    F1-anti-shortcut/SKILL.md        ← 对抗捷径偏好 (order=100)
    F2-expose-uncertainty/SKILL.md   ← 暴露不确定性 (order=110)
    F3-safe-operations/SKILL.md      ← 安全执行操作 (order=120)
    F4-code-quality/SKILL.md         ← 代码正确可维护 (order=200)
    F5-tool-communication/SKILL.md   ← 规范工具与通信 (order=300)
  task/                              ← 保持不变：用户按需加载的 SOP
  directive/                         ← 保持不变：行为模式开关
  capability/                        ← 工具/模式扩展
    git-proxy/SKILL.md               ← 从 standard/git/proxy 迁移
    parse-dont-validate/SKILL.md     ← 原有
  standard/                          ← 删除（内容已全部迁移到 self-function 或 capability）
```

## 一、已完成的撰写

6 个 self-function SKILL.md 已创建，每个包含：

| 文件 | 核心内容 |
|------|---------|
| F1-anti-shortcut | 假设显式化 + 后果陈述 + 困难识别 + 遍历完整性 + 根因纠正。含评分锚点和反模式清单 |
| F2-expose-uncertainty | 歧义追问 + 关键决策告知 + 理解传播 + 交付完整性。含关键决策清单 |
| F3-safe-operations | 可逆性评估 + 危险操作清单 + 不绕安全检查 + 运行环境保护。含完整危险操作清单 |
| F4-code-quality | 不破坏契约 + 文件组织 + 修改方式 + 测试有效性 + 注释同步。含全部子功能详细措施（吸收 24 个 standard skill 的关键内容） |
| F5-tool-communication | show type 选择 + 工具角色 + 输出预处理 + 沟通风格。含 show 四种 type 详则和工具边界 |
| F0-user-requirements | 动态容器机制 + 约束提取规则 + F0.1-F0.3 子功能。含正反例对照 |

## 二、预演：@step @bugfix 示例

```
用户: @step @bugfix 修复 users.ts 登录超时问题

[系统提示词注入]
  system prompt 基座
  + F1-anti-shortcut (order=100)
  + F2-expose-uncertainty (order=110)
  + F3-safe-operations (order=120)
  + F4-code-quality (order=200)
  + F5-tool-communication (order=300)
  + F0-user-requirements (order=500)

[用户消息注入]
  mentionedSkills: [directive/step, task/bugfix]

[模型 thinking 第 0 步]
输入登记:
  用户请求: "修复 users.ts 登录超时问题"
  任务类型: bugfix（代码修改）
  涉及文件: users.ts

F0 在场登记:
  加载的 skill: directive/step, task/bugfix

F0 约束提取:
  F0.1 [step] 每个操作步骤前展示计划并等待用户确认
  F0.2 [step] 每步输出当前进度和下一步计划
  F0.3 [bugfix] 先诊断根因才能修复（禁止盲目修改代码）
  F0.4 [bugfix] 修复后验证修复有效性

[模型 thinking 第 1 步 — F1 假设显式化]
假设 1: 登录超时的根因在 users.ts 中（可能在 auth 模块、网络层、或数据库查询）
  → 若不成立，修改 users.ts 无法解决问题
假设 2: 用户说的"修复"指解决根因而非绕过超时（如增加 timeout 值）
  → 若不成立，用户实际想让我增加超时容忍度而非修复底层问题

[模型 thinking 第 3 步 — DFMEA 遍历]
F0.3 [bugfix] "先诊断根因" O=7 D=7
  → 预防: 先用 observe 读取相关代码，用 reason 分析可能的超时原因，输出诊断结论后再修改
  → 探测: 自检时检查是否有显式的根因诊断输出

F2.1 歧义追问 O=8 D=8
  → "修复登录超时"无歧义——这是一个明确的技术问题描述
  → 判定：F2.1 本轮不适用（无歧义）

...（遍历 F3-F5 全部在场子功能）

[执行]
  步骤 1: show(ask user question) "我将先诊断登录超时的根因，计划如下：..." [F0.1 满足点]
```

## 三、系统提示词基座变更

需要在基座 system prompt 中加入对 self-function 体系的简短说明：

```
你收到的 skill 分为两类：
1. self-function (F0-F5)：产线核心功能。每个包含功能定义和 DFMEA 表格片段。
   你的职责：在 thinking 中按表格逐条分析、预防、自检。遍历不可主观跳过。
2. 用户加载的 task/directive/capability skill：作为 F0 的在场约束处理。
   你的职责：在第 0 步提取约束，在第 3 步遍历分析，在第 5 步逐条自检。

关键规则：
- F1-F5 遍历不可跳过（主观跳过 = F1.4 失效）
- F0 每轮重新登记约束
- 预防措施必须是具体决定（非准则复述）
- 自检必须产出可指认证据（引用、计数、位置）
- 简单任务仍走完步骤 0-2（假设、后果、困难），步骤 3-5 可加速
```

## 四、Standard Skill 迁移清单

| 现有 standard skill | 目标位置 | 说明 |
|---------------------|---------|------|
| workflow | → F1-anti-shortcut | 增强为完整 DFMEA 遍历 |
| communication/feedback | → F2-expose-uncertainty | 增强为理解传播 |
| safety/* (6) | → F3-safe-operations | 合并到 4 个子功能 |
| coding-style, file-organization/* (5), write/* (5), no-search-and-replace, test-standard/* (9), code-comment/* (7) | → F4-code-quality | 合并到 5 个子功能 |
| communication/* (6), show-usage, exec/* (7), git/commit-from-file, git/workflow | → F5-tool-communication | 合并到 4 个子功能 |
| git/proxy | → capability/git-proxy | 工具扩展 |

迁移后 `data/skills/standard/` 目录删除。

## 五、需要代码层面的变更

1. `packages/skills/src/scanner.ts`：添加 `self-function` 到 CATEGORIES 常量
2. `packages/skills/src/parser.ts`：`deriveNameFromPath` 需正确处理 `F0-user-requirements` 这种目录名（当前逻辑用 `-` 连接目录层级，需确认 F0 平级目录名不会产生冲突）
3. 系统提示词基座：参照上文"系统提示词基座变更"
4. `packages/format-prompt/src/index.ts`：将 `system_with_skill` 拆分为基础 system 与 skill user 消息
5. F0 的动态填充：`user_input` 消息构建时，将加载的 task/directive/capability skill 注入 mentionedSkills（已有机製）

## 六、实施步骤

### 阶段 1：已完成
- [x] 6 个 self-function SKILL.md 撰写
- [x] git/proxy 迁移到 capability
- [x] 全部 docs/ie/ 文档更新

### 阶段 2：代码适配（待执行）
- [ ] scanner.ts 添加 self-function 分类
- [ ] 修改系统提示词基座
- [ ] 验证 self-function skill 被正确扫描和加载

### 阶段 3：清理
- [ ] 确认 self-function 覆盖全部 standard skill 内容后，删除 `data/skills/standard/` 目录
- [ ] 更新 `data/skills/TODO.md`

### 阶段 4：实跑验证
- [ ] 跑不同复杂度任务，观察模型是否正确使用 self-function
- [ ] 重点：F1.1 假设显式化是否真正执行（而非走过场）
- [ ] 重点：F0 约束提取准确性
- [ ] 校准 O/D 评分
