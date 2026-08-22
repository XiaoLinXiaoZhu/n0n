# 重建 07：旧系统提示词审计与最小化

本文处理 self-function 重建时遗漏的另一份输入：`apps/code/src/prompts/code.md`。旧提示词显式记录了若干历史 bad case，但没有进入 `docs/ie/rebuild/02-coverage.md` 的覆盖范围，也没有随着 self-function 文档化一起缩减。

旧文本保存在 `apps/code/src/prompts/code-2026-0821.md`，并以提示词版本 `2026-08-21` 注册，供回归对比。默认 `code.md` 只保留一句角色定义。

## 一、设计结论

提示词分为四层，各自只有一个职责：

| 层 | 位置 | 职责 |
|----|------|------|
| 角色 | system 消息 | 说明模型是什么 |
| 长期行为标准 | system 后的 init skill user 消息 | D0-D5 与规范性附录 |
| 运行时协议 | 当前用户请求末尾的 `<system-hint>` | 解释 `<user-request>`、`<system-hint>`、`<skill>` 标签 |
| 工具契约 | tool definitions | 工具用途、参数、返回与 `show` 可见性 |

该划分保留现有稳定前缀：init skill 仍是 system 后的独立 user 消息，并由 cache breakpoint 覆盖。没有把约 5k tokens 的标准在每个工具轮次重新复制到尾部。

默认 system prompt 为：

> You are a coding agent operating in a local development environment.

外部依据：截至 2026-08-21，[OpenAI 官方模型提示指南](https://developers.openai.com/api/docs/guides/model-guidance?model=gpt-5.6#prompting-best-practices)建议从能够通过评测的最小提示与工具集开始，先删除重复脚手架，只为测得的失效模式增加最小规则；同时要求保留结果、成功条件、权限、安全、证据与停止条件。本文采用这一迁移原则，但具体分层由 n0n 的消息实现和 skill ground truth 决定。

## 二、旧提示词逐条处置

| 旧内容 | 处置位置 | 结论 |
|--------|----------|------|
| 每个决策点执行 pointing-and-calling，检查不完整等于没检查 | 0.6.3、D2.5.1、D3.5.1 | 保留“逐条核对并给证据”；移除“每个决策都向外显式口呼”，后者会制造报告噪音 |
| 遵守规则时引用规则名和具体条款 | 0.6.3、D2.5.1 | 保留可核对证据；不要求逐次引用规则原文，避免复述要求冒充验证 |
| 决策时列出被否决替代方案 | D1.3.4、D2.3.5 | 保留，限定在公示与用户需要审查决定的场合 |
| 动作前预测结果与失败，动作后比对 | D3.5.3、D5.5.2 | 已保留 |
| 检查代码时逐项识别函数、参数、返回类型、副作用 | D4.1.3 | 本轮补入，改写为与变更相关的契约要素 |
| 出现 probably / should work 时转为具体验证 | D3.5.4 | 已保留 |
| coding agent、本地环境 | `code.md` | 保留为唯一 system 角色定义 |
| 只有 `show` 能被用户看到 | `show` 工具定义 | 由接口自述，不在 system 重复 |
| 用户信息渐进、不完整、模糊或错误 | D2.2.3、D2.2.4、D2.6 | 已保留 |
| 识别实际目标，不逐字执行局部动作 | D2.2.6 | 本轮补入任务契约 |
| 纠正错误事实与误解 | D2.2.4 | 已保留 |
| 把请求视为待验证假设 | D2.3.1 | 以假设清单的可检查形式保留 |
| 复杂目标拆成可验证步骤 | D2.3.8 | 本轮补入 |
| 同一响应批量提交调用 | D3.1.2、D3.1.3、A.1 | 已保留 |
| `<system-hint>` 与 `<user-request>` 的含义 | `CODE_RUNTIME_PROTOCOL` | 移到当前请求的可剥离 tail hint |
| 中文输出 | D1.5.1 | 已保留；思考语言由附录 B 单独规定 |
| `<skill>` 是约束，冲突时具体者优先 | `CODE_RUNTIME_PROTOCOL`、0.5.3 | 标签语义放运行时协议，冲突规则放标准 |
| 按需执行 `n0n skill read` | 首次请求的环境上下文与 CLI 帮助 | 属当前环境能力，不写入长期 system |

## 三、为什么不把旧提示词直接改写成更短版本

旧文本混合了角色、行为标准、运行时协议和工具事实。把它压缩到十几行仍然会留下四个问题：

1. 同一规则在 system 与 self-function 中有两个修订点。
2. 工具事实变化时需要修改 system，而工具定义本可自述。
3. bad case 以口号存在，没有适用条件与验收证据。
4. system 开头与模型控制信息、工具定义争夺固定注意力。

因此处理单位不是“句子能否缩短”，而是“它属于哪一层”。只有角色没有更合适的下游承载位置。

## 四、被否决的替代方案

**把全部 init skill 复制到每一轮请求尾部。** 否决。它会让约 5k tokens 规则随轮次累积，或要求历史重写从而破坏提示词缓存；当前没有评测证明收益足以覆盖成本。现有 init user 消息已经把大部分约束移出 system，并保持稳定前缀。

**只删除旧 system，不保存映射。** 否决。旧文本是历史 bad case 的唯一清单，直接删除会重复 self-function 首次重建的遗漏。本文与日期快照共同保留可追踪性。

**把运行时标签协议写进 D0。** 否决。标签名称和拼装位置属于当前实现口径，不是长期行为标准；它们变化时不应触动 self-function 契约。

## 五、变更后的验证

应同时满足：

1. `getPrompt()` 只返回一句角色定义。
2. `getPrompt("2026-08-21")` 可取回旧提示词快照。
3. 预览中 system 与 init skill 仍是两个消息，init skill 顺序不变。
4. 真实用户请求末尾出现运行时协议，历史请求中的该 hint 可被剥离。
5. 旧提示词表中的每条实质规则都有保留、迁移或拒绝理由。
6. 类型检查、测试与格式检查通过。

仓库变更尚未安装到 `~/.n0n/builtin-skills` 时，使用
`bun run apps/code/scripts/preview-prompt.ts --repository-skills` 生成预览。
该模式复用同一套扫描、加载、格式化与 agent loop，只把 skill 根目录显式指向
仓库，避免为了预览而覆盖本地安装。
