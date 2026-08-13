# 交接与验收文档：self-function 标准重建

本文供你在实际测试后核对新标准是否生效、是否有效、是否产生副作用，以及发现问题后如何修改。假定读者不掌握此前上下文。

## 一、当前状态

旧的 F0-F5 六份 skill 已完全废弃并从仓库与运行时删除，替换为按动作对象组织的七份文档。替换已完成并通过验证，新标准从替换后的第一轮对话开始生效。

| 位置 | 内容 |
|------|------|
| `data/skills/self-function/` | 生效中的标准，7 个目录 |
| `~/.n0n/builtin-skills/self-function/` | 运行时副本，由 `n0n skill init` 从上一行同步 |
| `docs/ie/rebuild/draft/` | 草案原件，与生效版本逐字节相同，修改从这里开始 |
| `docs/ie/rebuild/01-action-objects.md` | 骨架、边界规则、变更记录、工具定义打磨记录 |
| `docs/ie/rebuild/02-coverage.md` | 旧体系内容到新条款的逐条追踪 |
| `docs/ie/rebuild/03-review-findings.md` | 审查发现的分级与处置 |
| `docs/ie/self-function-ground-truth.md` | 上游基准，一切设计与本文冲突时以它为准 |

标准的组织方式：第 0 章总则与术语；D1 对话与交付；D2 任务状态与流程；D3 信息获取；D4 代码与文件内容；D5 执行环境与外部系统；附录 A 环境与工具口径。一个动作的全部义务写在它所属的一章内，不跨章拼装。

## 二、确认机制已生效

三条命令，任一不符即说明安装有问题。

```
ls ~/.n0n/builtin-skills/self-function/
```
应输出且仅输出：`A-toolchain D0-general D1-dialogue D2-task-state D3-information D4-code D5-environment`。若出现 `F0-` 到 `F5-` 开头的目录，说明旧标准仍在运行时，两套规则会同时注入。

```
diff -rq data/skills ~/.n0n/builtin-skills
```
应只报 `Only in data/skills: TODO.md`。其余任何差异都意味着仓库与运行时不同步，执行 `n0n skill init` 修复。

```
bun run apps/code/scripts/preview-prompt.ts
rg -n "^# 第 0 章|^# D[1-5] |^# 附录 A" apps/code/scripts/PREVIEW.md
```
应按第 0 章、D1、D2、D3、D4、D5、附录 A 的顺序各命中一次。顺序错乱说明 frontmatter 的 order 被改动。

当前基线：系统提示词约 5,324 tokens，含工具定义与环境上下文的总前缀约 5,845 tokens。旧体系同口径约 4,855 tokens。

## 三、观察行为是否符合条款

下表是新标准中最值得盯的条款。左列是应当看到的行为，右列是失效时的样子。观察对象是 agent 在真实任务中的表现。

| 条款 | 应看到 | 失效迹象 |
|------|--------|---------|
| D2.1.1 四阶段 | 动手前有输入登记、假设、方案；交付前有判据核对 | 收到请求直接开始改文件 |
| D2.2.1 空登记 | 没有额外约束时显式写"无活跃约束" | 完全不提约束这件事 |
| D2.2.3 把握不高也提出 | 请求模糊或它自己没把握时先问 | 自行选一种理解直接做，事后才说"我理解你的意思是" |
| D2.3.1 假设含证据与后果 | 每条假设写明依据哪个文件哪一行、不成立会怎样 | 列出假设但没有证据，或只有一句"假设代码结构不变" |
| D2.3.5 方案公示 | 公示所选方案、理由、至少一个被否决的替代方案 | 只说要做什么，不说否决了什么 |
| D2.3.6 待答复 | 涉及不可逆动作、结构变更、范围显著变化时停下等你 | 结构变更直接做完再告知 |
| D2.5.3 不得声称未执行的验证 | 说"测试通过"时附带实际输出 | 说"应该没问题""已修复"而无输出 |
| D1.3.2 提问含把握程度 | 提问时说明它倾向哪个选项、有多大把握 | 只列选项不给倾向 |
| D1.3.4 公示三要素 | 决定、理由、被否决的替代方案 | 只有决定 |
| D3.1.2 批量提交 | 独立的读取合并在同一响应发出 | 一次只发一个调用，反复往返 |
| D3.5.1 判断基于本轮观察 | 对代码行为的断言指向具体位置与输出 | 凭印象描述代码怎么工作 |
| D4.1.1 先查引用点 | 改公共定义前先检索全部调用方 | 改完再说"应该没有别的地方用到" |
| D4.3.1 删除文件先确认 | 删任何仓库内文件前问你 | 直接删 |
| D4.6.2 测试有效性验证 | 新写测试后故意改坏被测代码确认它会失败 | 写完测试跑通就交 |
| D5.1.3 一律确认清单 | 终止进程、依赖变更、推送、对外操作前一律问 | 自行判断"这个风险不大"就做了 |
| D5.5.2 预测失败判据 | 执行命令前说明什么输出算失败，执行后比对 | 执行完只说"成功了" |
| A.2 显式等待上限 | 跑测试与类型检查时显式设置 waitfor | 用默认 20 秒，频繁转后台再去读产物 |

## 四、判断条款是否被形式化执行

条款被执行和条款起作用是两件事。最可能的失效不是不做，而是做成空壳。三个探针：

**假设清单探针。** 看假设是否可证伪。"假设代码能正常工作"不可证伪，属于空壳；"假设 `scheduler.ts` 按 enqueue 顺序执行（依据第 88 行队首判断），若不成立则同批调用的顺序假设失效"是有效的。

**不适用判定探针。** 标准允许判定某条不适用，但要求写明适用条件中哪一条不成立（第 0 章 0.6.4）。看到"本轮不涉及，跳过"而没有指出具体条件的，是在利用条款开脱。

**验收证据探针。** 每章末尾有验收证据清单。交付时应能对上——例如 D4.9 要求给出被修改公共定义的引用点同步情况、类型检查与测试的实际输出。只说"已验证"而拿不出对应项的，说明核对没有真正发生。

## 五、观察副作用

新标准比旧体系严格，需要确认它没有把成本转嫁成噪音。

**确认疲劳。** D5.1.3 的清单较长，终止进程、依赖变更都要确认。如果实际使用中你被过多确认打断，记录哪几类动作最频繁——这些是收紧过度的候选，可以下调为公示。

**公示膨胀。** D2.3.5 要求每个方案都公示替代方案。如果多数公示内容空洞（"替代方案是不做这件事"），说明该条款对简单任务过重，可考虑加适用条件。

**阶段开销。** D2.7.3 允许阶段产出简短但不得为零。观察简单任务（例如改一行文字）是否被拖成多轮。若是，问题在于 D2.7 的裁剪规则不够，而不是四阶段本身。

**上下文占用。** 每轮固定 5.8k 前缀。若在长任务中感到上下文紧张，优先压缩的对象是各章的验收证据清单（它们只在交付时用到），而不是要求条款。

## 六、发现问题后的修改流程

标准是受控文档，改动走固定路径，不要直接改 `data/skills/` 或运行时副本。

1. 改 `docs/ie/rebuild/draft/` 下对应文件。
2. 在 `docs/ie/rebuild/01-action-objects.md` 第六节变更记录追加一行：改了什么、为什么。
3. 同步到仓库与运行时：

```
cd /Users/xlxz/projects/n0n
cp docs/ie/rebuild/draft/00-general.md   data/skills/self-function/D0-general/SKILL.md
cp docs/ie/rebuild/draft/01-dialogue.md  data/skills/self-function/D1-dialogue/SKILL.md
cp docs/ie/rebuild/draft/02-task-state.md data/skills/self-function/D2-task-state/SKILL.md
cp docs/ie/rebuild/draft/03-information.md data/skills/self-function/D3-information/SKILL.md
cp docs/ie/rebuild/draft/04-code.md      data/skills/self-function/D4-code/SKILL.md
cp docs/ie/rebuild/draft/05-environment.md data/skills/self-function/D5-environment/SKILL.md
cp docs/ie/rebuild/draft/A-environment.md data/skills/self-function/A-toolchain/SKILL.md
n0n skill init
diff -rq data/skills ~/.n0n/builtin-skills
```

最后一条应只报 `TODO.md`。

改动涉及条款增删时，同时检查 `docs/ie/rebuild/02-coverage.md` 的追踪表是否需要更新。

## 七、未决事项

| 事项 | 说明 |
|------|------|
| `data/skills/TODO.md` | 内容已完全陈旧：它讨论的 14 个碎片 skill（safety-no-sudo、communication-no-emoji 等）随旧 standard 目录早已删除，问题本身正是这次重建解决的。删除或归档待定 |
| `docs/ie/` 下九份第一版文档 | background、goals、methodology、voc-analysis、ctq-and-functions、dfmea-table、coverage-check、thinking-spec、implementation-plan 都是产出旧 F0-F5 的记录，其中 implementation-plan 描述的目录结构已不存在。保留作历史还是归档待定 |
| 工具接口的信息承载 | 标准移除了输出预算语义与执行产物结构，理由是工具接口应自述。当前 `output_tokens` 描述已说明预算覆盖 stdout 与 stderr 合计，截断与后台的返回也带产物路径与读取指引。若实测发现模型仍误判，需要在工具返回中进一步加强，而不是把它写回标准 |
| 默认等待时间 20 秒 | 本轮从 120 秒下调。`bun test` 实测约 15 秒，接近该值。若实际使用中转后台过于频繁，说明 A.2 的"显式设置等待上限"这条要求没有被遵守，或者 20 秒仍偏紧 |

## 八、本次重建的判断依据

留作后续争议时的溯源。

旧体系按失效倾向切分（捷径偏好、不确定性、安全、代码质量、通信），导致同一个动作的规则散落多章且要求不一致——"删除文件"在旧 `F3:19`、`F3:29`、`F2:52` 三处被规定，一处要求确认、一处要求告知。新体系按动作对象切分，使一个动作的全部义务集中在一处。

标准正文不含具体工具命令，命令集中在附录 A。这样环境或项目变化时只改附录，不触动要求条款。能由工具接口自身说明的内容（参数语义、返回结构、限额、产物位置）标准与附录都不收录。

方案选型的要求是透明而非决定权转移：默认公示不暂停，只在涉及不可逆动作、结构变更、范围显著变化时才等答复。理由是把常规判断推回用户会使确认贬值，真正需要介入时反而被淹没。
