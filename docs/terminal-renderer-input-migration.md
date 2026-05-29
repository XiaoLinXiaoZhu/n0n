# 用 @xlxz/terminal-renderer 替换 apps/code 多行输入 — 设计方案

> 状态：设计阶段（讨论已收敛，待包侧前置缺口补齐后实现）
> 分支：`feat/terminal-renderer-input`
> 关联 issue：https://github.com/XiaoLinXiaoZhu/terminal-renderer/issues/1

## 背景与范围决策

最初的诉求是"用 `@xlxz/terminal-renderer` 替换 apps/code 所有终端渲染逻辑"。经过多轮分析与实测，范围收敛为 **只替换多行输入**，其余渲染逻辑保持不变。

### 为什么不做"全量替换 / 并行工具卡片渲染"

讨论中评估过把工具调用渲染从"FIFO 串行"改为"并行多卡片实时观测"（利用包的 Grid + Ownership 模型给每个并行工具分配独立区域）。结论是 **收益小、风险高，搁置**：

- **终端高度是硬约束（实测确认）**：动态区逻辑高度 N 超过终端可见行数时，相对光标定位崩坏，中段内容被**静默吞没**（见下方 demo 证据）。并行多卡片极易触发。
- **收益被削弱**：并行可观测的价值，被"每卡片只能折叠成尾窗、大输出塞不进一屏"大幅削弱。
- **改动面大**：需改 scheduler 事件消费层、把折叠状态从单字段重写为 per-tool Map、实现"全部结束后按调用顺序一次性固化"。

而多行输入替换 **收益实打实、风险低、改动面窄**，是更优先的目标。

### 为什么输入替换是低风险高回报

| 维度 | 并行卡片渲染 | 多行输入替换 |
|---|---|---|
| 收益 | 并行可观测（受终端高度削弱） | @补全 / 状态栏 / 更好编辑（现有包做不到） |
| 风险 | 高（边界二静默吞内容） | 低（TextInput 自带滚动规避边界二；提交后互斥） |
| 改动面 | 大（scheduler 消费层 + per-tool Map + 一次性固化） | 小（仅 `promptUser` 一处 + 新输入渲染器） |

关键安全性：
- **两套渲染时间上互斥**：输入期间用 Viewport 管理底部动态区；submit 后 `Viewport.commit` 把输入固化为历史一行并 unmount，之后 RichRenderer 的 raw write 不受影响。两者从不并存。
- **天然规避终端高度边界**：`TextInput` 自带 `scrollOffset` + `ensureCursorVisible`，包内部已做视口滚动、只渲染可见窗口。输入是单一受控 widget，不像并行卡片需要应用层折叠保证总高 ≤ 终端高度。

## 终端行为实测结论（边界研究）

用三个最小可证伪 demo 在真实终端（Windows Terminal + PowerShell，115x70）验证，结论：

### 边界一：用户上翻看历史 —— 非问题
- 实测（demo3）：用户上翻脱离底部后，新输出**不会**把视窗拽回底部。终端的"非激进跟随"已替我们处理"用户看历史时不打扰"。
- 程序**无法**被动查询用户的 scrollback 滚动位置：ANSI/VT/xterm 协议不提供该能力（CPR `\x1b[6n` 只返回光标物理位置、不反映视窗偏移；无 scrollback 位置查询序列）。
- 唯一能感知滚动的路径是开启鼠标上报接管滚轮，但会抢走终端原生 scrollback 滚动、等于自己做全屏 TUI——与"上方走原生滚动历史"的设计边界冲突。**放弃主动感知，依赖终端原生行为。**

### 边界二：动态区高度 > 终端可见高度 —— 真问题，硬约束
- 实测（demo1）：`\x1b[NA` 相对上移被**钳制在当前屏幕视窗内**，进了 scrollback 的行够不着。
- 实测（demo2，N=90 > rows=70）：现象是 `ROW 000..068` 整齐后**直接跳到 ROW 089，中间 069..088 静默消失**——不是重叠错乱，而是中段被覆盖吞没。比错乱更危险，因为用户无感知数据丢失。
- 根因：Viewport 用相对光标移动定位，隐含假设"动态区完整在屏幕可见范围内"。N>rows 时假设破裂。
- **硬约束：动态区逻辑高度必须 ≤ 终端可见行数。** 对输入场景，TextInput 的内部滚动已满足；对（已搁置的）并行卡片，需应用层折叠保证。
- **包侧缺口（建议进 issue）**：Viewport/Grid 应感知 `terminalRows`，N>rows 时明确钳制（`grid.rows = min(逻辑高度, terminalRows)`）并暴露可用高度，而非静默吞内容。

> demo 脚本见 `docs/terminal-renderer-input-demos/`（demo1-clamp / demo2-viewport-sim / demo3-scroll-follow），可在真实终端重新运行复现。

## 现状

### 待替换对象
- `@n0n/multiline-input`（workspace 包，核心 450 行：reader.ts 312 + input-buffer.ts 124 + index 14）
- 能力：raw mode + bracketed paste、宽字符光标、Alt+Enter / Ctrl+D 提交、Ctrl+Q 中断、自绘多行重排

### 接入点（极窄）
- `apps/code/src/repl.ts` 中唯一接入：`promptUser()` → `readMultilineInput({ prompt, hint, connectStdin })`，返回 `{ text }`。
- 约 11 处调用都经 `promptUser()`。替换只需重写该函数内部，调用点不变。
- `connectStdin` 把 stdin 数据流接给 input handler，repl 用 `stdin.phase`（input/idle）做多路复用。

### 新包提供的能力
- `TextInput`：多行编辑、折行、CJK 宽字符、光标、`scrollOffset` 滚动、`ensureCursorVisible`、`decorations`（区间样式）
- `Menu`：列表选择器 widget
- `Grid`：虚拟缓冲，cell 级 dirty diff，Ownership 模型（多 widget 共享同一 Grid 互不干扰）
- `Viewport`：终端尾部动态区域 mount/render/commit/remount
- `parseKey`：raw stdin buffer → KeyAction
- `charWidth`：单字符宽度

## 目标设计

### 阶段一：对等替换（先跑通）

实现一个新的 `readMultilineInput` 等价物（放在 apps/code 内或 cli-ui，待定），用新包重建现有能力：

- raw mode 接管 stdin（沿用 repl 的 `connectStdin` / `stdin.phase` 模型）
- `parseKey` 解析按键 → 驱动 `TextInput`（insertChar / deleteBeforeCursor / move*）
- bracketed paste 批量插入（`TextInput.insertChar` 已支持任意长度字符串）
- Alt+Enter / Ctrl+D 提交，Ctrl+Q/Ctrl+C 中断
- 渲染：`Grid` + `Viewport`，`TextInput.paint` 到 owner 区域；submit 时 `Viewport.commit` 固化为历史、unmount
- 宽字符光标定位由 TextInput + charWidth 处理

接口保持与现有一致（输入 `{prompt, hint, connectStdin}`，输出 `{text}`），使 repl 的 11 处调用零改动。

### 阶段二：增强能力（新包独有价值）

- **`@xxx` 提示补全**：
  - 检测输入中的 `@token`（光标前）触发补全
  - 用 `TextInput.decorations` 高亮 `@token`
  - 候选菜单用 `Menu` widget paint 到 Grid 的**另一个 owner** 区域（参考包的 `demo/mention.ts`）
  - 上下键选择、回车/Tab 补全
- **输入区尾部状态栏**：
  - 字符数 / 当前光标位置（行,列）/ 总行数 / 总字符数
  - 用 Grid 的**独立 owner** paint 到输入区尾部，与输入框共存于同一动态区
  - Viewport 统一管理整块高度

## 前置阻塞项（包侧）

阶段一落地前，包的 `parseKey` 需补齐（已在 issue #1，由包维护者补）：

- **Alt+Enter**：字节序列 `27, 13`（ESC + CR），当前既非单字节、也不匹配 `\x1b[` 前缀，落入 `unknown`。这是主提交键。
- **bracketed paste**：识别 `\x1b[200~` / `\x1b[201~` 包裹序列，区分"粘贴一大段"与"逐字输入"。
- （次要）Home/End、Ctrl+方向（按词移动），增强编辑体验。

兜底方案：若包暂不补，可在应用层 parseKey 之外加一层预处理识别 Alt+Enter 和 paste 包裹序列。优先等包侧补齐。

## 实施顺序

1. 等包侧补齐 parseKey（Alt+Enter / bracketed paste）—— 阻塞项
2. 阶段一对等替换，跑通后用真实终端验证（粘贴多行、宽字符、提交/中断）
3. 移除 `@n0n/multiline-input` 依赖，确认 repl 11 处调用正常
4. 阶段二增强：先状态栏（简单、纯展示），后 @补全（涉及 Menu + 交互）
5. 各步骤独立 commit

## 待确认 / 开放问题

- 新输入渲染器放 apps/code 还是 cli-ui？倾向 apps/code（应用特化），cli-ui 保持现有，避免影响共享它的 apps/fairy。
- 状态栏字段最终集合（字符数/光标/行数/总字符——是否还要别的）。
- @补全的候选来源（文件路径？符号？历史？）——决定 Menu 的数据填充逻辑。
