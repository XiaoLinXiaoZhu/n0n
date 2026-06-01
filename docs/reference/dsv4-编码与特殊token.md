# DeepSeek-V4 编码机制与特殊 Token 参考

> **说明**
> - 本文档记录 DeepSeek-V4 系列模型的 prompt 编码格式、特殊 token 行为及其在不同 API 端点上的可用性。
> - 编码器参考实现：`scripts/encoding-dsv4.ts`（移植自官方 `encoding_dsv4.py`）。官方源码与测试用例可从 `deepseek-ai/DeepSeek-V4-Pro` 仓库 `encoding/` 目录获取。
> - 文档内的行为结论均基于在官方 API（`api.deepseek.com`）与 PPIO 网关上的实测。

---

## 1. 特殊 Token 一览

| Token | 用途 |
|---|---|
| `<｜begin▁of▁sentence｜>` | BOS，序列开头 |
| `<｜end▁of▁sentence｜>` | EOS，assistant 回合结束。在 **输入 prompt 中是普通的回合分隔符**；只有模型**生成**它时才是停止符 |
| `<｜User｜>` | user 回合前缀 |
| `<｜Assistant｜>` | assistant 回合前缀 |
| `<｜latest_reminder｜>` | 实时元信息槽（日期/地点/平台等） |
| `<think>` / `</think>` | 思维链分隔 |
| `｜DSML｜` | 工具调用标记 token |

Task token（快速指令任务，见第 5 节）：`<｜action｜>` `<｜query｜>` `<｜authority｜>` `<｜domain｜>` `<｜title｜>` `<｜read_url｜>`

---

## 2. 消息编码结构

### 基本多轮
```
<｜begin▁of▁sentence｜>{system}<｜User｜>{user}<｜Assistant｜></think>{response}<｜end▁of▁sentence｜><｜User｜>{user2}<｜Assistant｜><think>
```
- BOS 加在整个会话最前。
- thinking 模式下，历史 assistant 回复的思考通常被 drop（`drop_thinking`），渲染成 `<｜Assistant｜></think>{正文}<｜end▁of▁sentence｜>`；只有最后一轮保留 `<｜Assistant｜><think>` 作为生成锚点。
- chat 模式下 `</think>` 紧跟 `<｜Assistant｜>`，模型直接出正文。

### 工具调用（DSML 格式）
- assistant 的工具调用编码为 `<｜DSML｜tool_calls>` 块：
```
<｜DSML｜tool_calls>
<｜DSML｜invoke name="$TOOL">
<｜DSML｜parameter name="$P" string="true|false">$VALUE</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜tool_calls>
```
- string 类型参数 `string="true"` 原样传值；其他类型（数字/布尔/数组/对象）`string="false"` 传 JSON。

### Tool 消息会被合并进 user 回合（重要）
`mergeToolMessages` 预处理规则：
1. **`role:"tool"` 永远不独立存在**——转成 `{type:"tool_result"}` block，塞进**前一个 user 回合**；若前面不是 user 则新建一个 user 回合。
2. **并行工具结果合并进同一个 user 回合**，多个 `<tool_result>` 用空行分隔。
3. **tool_result 后紧跟的 user 文本也并入同一回合**（作为该回合的 text block）。
4. **乱序自动纠正**：`sortToolResultsByCallOrder` 按 assistant **发起调用的顺序**重排 tool_result，与工具实际完成顺序无关。

最终形态：
```
…<｜Assistant｜></think>{正文}<｜DSML｜tool_calls>…</｜DSML｜tool_calls><｜end▁of▁sentence｜><｜User｜><tool_result>结果1</tool_result>

<tool_result>结果2</tool_result>

{user补充文本}<｜Assistant｜>…
```

---

## 3. `latest_reminder` 行为

### 用途（官方定义）
承载**会话级实时元信息**：日期、星期、城市、客户端、语言。官方 content 形如 `2026-02-21,星期六,广州,App,中文`。它解决"模型权重冻结、不知道当前时间/地点"的问题，**不是通用的指令或配置覆盖机制**。

### 位置规则
- 官方位置：**system 之后、首个 user 之前**。
- 编码器对它特殊处理：`latest_reminder` **不触发新的 Assistant 回合**，直接拼在前一条内容之后。
- **干净独立的充要条件**：前面是已 EOS 收尾的回合（assistant 或 system），后面是 user。
- 不满足条件时的失败模式：
  - 跟在**未 EOS 的 assistant 后** → 黏进 assistant 正文。
  - 跟在**最后一个 user 后** → 掉进生成的 `<think>` 里，污染思考。
- **合法的"贴近生成点"放法**：放在「历史（assistant→EOS 结尾）之后、新 user 之前」。可用"双 reminder"（头部声明一次 + 生成点前刷新一次）让实时元信息在长上下文后仍贴近生成点。

### 权重特性（实测）
`latest_reminder` 槽是**低权重**的。同一句指令，放进 `latest_reminder` 比放进普通 user 消息**约束力更弱**：在冲突覆盖测试中，普通 user 的尾部覆盖稳定生效，而 latest_reminder 的相同覆盖只有约一半时候压得过竞争值。

推论：
- **适合放**：事实性/声明性背景（角色客观属性、世界设定、场景快照）——只需"知道"不需"强遵守"，与官方"日期/地点"语义同构。
- **不适合放**：需要强遵守的约束（说话风格、身份规则、禁词表）——放进去等于降权，适得其反。
- **不适合放**：对话历史——会丢失回合归属（谁说的、哪句是 assistant 自己的输出）。历史应用原生 user/assistant 多轮序列。

---

## 4. Task Token / 快速指令任务

### 编码格式
| Token | 触发任务 | 格式 |
|---|---|---|
| `<｜action｜>` | 判断 user 请求是否需要联网搜索 | `…<｜User｜>{prompt}<｜Assistant｜><think><｜action｜>` |
| `<｜query｜>` | 为 user 请求生成搜索 query | `…<｜User｜>{prompt}<｜query｜>` |
| `<｜authority｜>` | 分类请求对来源权威性的需求 | `…<｜User｜>{prompt}<｜authority｜>` |
| `<｜title｜>` | 首轮回复后生成会话标题 | `…<｜Assistant｜>{response}<｜end▁of▁sentence｜><｜title｜>` |

- `action` 是**唯一被特殊处理的** task：token 接在 `<｜Assistant｜>` + thinking token **之后**；其他 task 直接接在 user 内容之后；`title` 接在 assistant 的 EOS 之后。

### action 实际行为（官方 raw 端点实测）
prompt 以 `<｜action｜>` 结尾时，模型续写一个搜索路由判断：
- 需要实时信息 → 输出 `🟢 搜索{关键词}</action>`（触发搜索）
- 不需要 → `</action>` 跳过，直接进入正常回答/思考

`query` → 生成搜索关键词（如 `【广州天气】【天气预报】【实时天气】`）；`title` → 生成标题。均符合文档。

---

## 5. API 端点可用性（关键）

### chat/completions 会丢弃 task 字段
标准 `/chat/completions` 端点（官方与 PPIO 均如此）**忽略消息上的 `task` 字段**——传 `task:"action"` 与不传行为完全一致，action 路由不触发。

### 手工拼接 task token 进 chat 消息无效
把 `<｜action｜>` 等 token 字符串写进 user content，在 chat 端点上**无法生效**：
1. token 字符串被 tokenizer 编码为**普通文字子词**，不是控制 token ID。
2. chat 端点会在 user 后**自动追加生成锚点** `<｜Assistant｜><think>`，prompt 无法以 `<｜action｜>` 真结尾。

### 只有 raw completions 端点能用 task token
特殊 token（含 task token）只有在能直接喂**原始 token 序列**的 raw completions 端点才被当控制信号处理。

| 端点 | task token / 原始 prompt |
|---|---|
| `api.deepseek.com/beta/completions`（官方 raw） | ✅ v4-pro 可用，action/query/title 均正常 |
| `api.deepseek.com/chat/completions`（官方 chat） | ❌ 丢弃 task 字段 |
| `api.ppio.com/openai/v1/completions`（PPIO raw） | 端点存在但**按模型逐个开关**：deepseek-v3 / r1 可用（200）；**v4-pro / v4-flash / v3.2 / qwen3.5-plus 被锁**（400 "does not support endpoint: completions"） |
| `api.ppio.com/openai/v1/chat/completions`（PPIO chat） | ❌ 丢弃 task 字段 |

**结论**：想在 v4-pro 上使用 task token，**只能走官方 `api.deepseek.com/beta/completions`** 并自行拼接 prompt（用 `encoding-dsv4.ts` 那套）。PPIO 不给 v4-pro 开 raw completions 端点。

---

## 6. logprobs 注意事项

- 官方与 PPIO 的 v4-pro 均支持 `logprobs` / `top_logprobs`。
- **thinking 模式下 logprobs 无判别力**：最终答案 token 在推理完成后近乎确定（P≈1.0）。测信心需用 `thinking:{type:"disabled"}` 关闭思考。
- 即便关闭思考，v4-pro 在简单任务上仍倾向给**接近 0/1 的硬分布**。不确定性更多体现为"不同采样给不同硬答案"（翻面频率），而非单次的软概率。
