# show 工具设计

`show` 是 Code Agent 唯一的用户可见结构化消息接口。工具参数始终只有：

- `type`：系统可辨的客户任务或质量终态；
- `content`：该消息的正文。

工具 schema 只验证字段与枚举。消息何时发送、正文应包含什么、终态是否成立，
由 `data/skills/self-function/production-quality/SKILL.md` 唯一规定，
不在工具描述中复制质量契约。

## 类型模型

类型关系的完整推导见
`docs/ie/rebuild-2/04-show-type-derivation.md`。最小协议核为 record、request、delivery、non-delivery；
当前 `{type, content}` 接口将三种客户责任和三种不交付处置展开为八个叶子。

| 协议核 | type | 客户或系统任务 | 系统行为 |
|---|---|---|---|
| record | `production record` | 客户按需复查，无需立即响应 | 渲染并持久化，不提醒、不等待，自动继续 |
| request | `customer information required` | 客户提供生产方无法自行取得的信息或材料 | 渲染、提醒并等待答复 |
| request | `customer decision required` | 客户作出决定、确认或授权 | 渲染、提醒并等待答复 |
| request | `customer action required` | 客户完成生产方无法代做的操作 | 渲染、提醒并等待答复 |
| delivery | `qualified delivery` | 客户依据证据验收当前完整基线 | 渲染、持久化并结束 |
| non-delivery | `production suspended` | 保存恢复条件，等待外部条件另行改变 | 渲染、持久化并结束 |
| non-delivery | `production failed` | 处理未交付原因、影响和后果 | 渲染、持久化并结束 |
| non-delivery | `customer cancelled` | 确认客户取消及必要收尾 | 渲染、持久化并结束 |

客户在周期开始时已经给完全部要求、后续不再参与时，运行时只暴露 `production record` 和四种终态，
不暴露三种 request 叶子。这只是订单参与条件对当前接口的约束，不产生另一套质量标准。

## production record

生产记录用于保存可复查的关键决定和影响后续生产的进展。它不是弹窗通知，也不是等待型聊天消息：

- 用户可以在界面中看到；
- session 中会保存独立记录；
- 不播放提醒；
- 不等待用户回复；
- 提交后运行时自动继续同一生产周期。

客户没有立即回复不表示同意或反对。需要客户决定时必须使用 `customer decision required`，
不能先用生产记录公示再执行需要授权的动作。

## 客户责任请求

`customer information required` 只请求客户提供生产方无法自行取得的事实、材料或字段，不要求客户作技术取舍。

`customer decision required` 只处理客户应决定的结果、范围、权限或重大风险承担。
生产方能够自行调查或作出专业判断时，不应把它转换成客户决定。

`customer action required` 只处理生产方确实无法代做的操作。三种 request 叶子都会暂停受影响的生产，
直到客户完成相应责任。

## 质量终态与机械状态

工具调用成功只表示接口接受了 `{ type, content }`。进程退出码、agent loop 结束、
工具执行成功和 headless 返回值都不能自动证明订单合格。

运行时直接根据终态类型控制结束，但类型选择仍由生产方依据质量标准完成：

- 不得用 `qualified delivery` 承载生产暂停或生产失败；
- 客户修订范围时先更新当前验收基线；满足修订后基线仍使用 `qualified delivery`；
- 不得把等待客户答复的交互提前标成 `production suspended`；
- 不得用 `production failed` 掩盖仍有明确恢复条件的暂停；
- 不得把生产失败写成 `customer cancelled`；
- 不得恢复一个通用终态，再让系统从正文猜测真实状态。

多工作项是订单内部状态，由当前验收基线和正文证据聚合，不产生组合型 show type。运行时异常是机制状态；
只有生产方恢复控制并完成质量判定后，才可提交相应终态，运行时不得代为伪造。

## 可见性与持久化

所有 `show` 结果都会写入 session：

- 顺序文件保存每次记录；
- `current-show.md` 保存最新记录；
- 交互界面按 type 使用不同标题和颜色渲染。

非交互运行把 show 正文渲染到日志，并在返回值中提供 session 目录供后续复查；
它不会代替客户提供信息、作出决定或完成操作，也不会自动批准需要人工复核的受限命令。

持久化失败不改变消息类型，也不能被当作质量证据。若审计记录是订单验收的必要条件，
生产方需要在终态前取得可核对的替代证据。

## 内容职责

工具描述只陈述可执行接口事实：

- 枚举值；
- 是否渲染、提醒、等待、继续或终止；
- 参数结构。

Self-Function 标准负责：

- 类型判定条件；
- 生产记录的信息价值；
- 三种客户责任请求的边界；
- 每种终态的合格判据；
- 客户验收所需证据。

这种分层使接口行为变化时只修改工具与运行时，使质量关系变化时只受控修订标准。
