# 用 @xlxz/terminal-renderer 替换 apps/code 多行输入 — 设计方案

> 状态：依赖已接入 @xlxz/terminal-renderer@0.1.3（parseKey 前置缺口已补齐），待进入阶段一编码
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

> **✅ 已解除（0.1.3）**：以下 parseKey 缺口在 `@xlxz/terminal-renderer@0.1.3` 已全部补齐——Alt+Enter（返回 `{type:"enter", alt:true}`）、bracketed paste（`pasteStart`/`pasteEnd`）、Home/End、带修饰符方向键（shift/alt/ctrl）。依赖已通过 `bun add` 接入 apps/code。下列为历史记录。

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

## 已决策（第二轮对齐）

### 1. 新输入渲染器放在 apps/code 内
不动 cli-ui（保持共享给 apps/fairy 的现状），新输入渲染器作为 apps/code 的应用特化代码。

### 2. 状态栏字段 + 宽度自适应
输入区尾部状态栏显示：字符数、当前光标位置（行,列）、总行数、总字符数。
**宽度不足时动态降级**：终端列宽不够容纳完整状态栏时，按优先级隐藏部分字段，或英文字段改用简写（如 `Lines:` → `L:`、`Chars:` → `C:`）。需在 paint 前根据 `terminalColumns` 计算可用宽度，逐级裁剪。

### 3. @ 提及补全（双框联动，仅行首触发）

**触发条件**：`@` 必须位于**行首**（光标所在逻辑行的第一个字符是 `@`）才触发补全。行中间的 `@` 不触发。

**数据源**：skill 列表，来自 `@n0n/skills` 的 `discoverSkillsMultiDir(getSkillDirs())`，返回 `SkillMeta[]`。
- 仅取 `activation === "auto"` 或 `"manual"` 的 skill（排除 init）。
- 每项可用字段：`name`、`alias[]`（别名，参与匹配与显示）、`description`（做什么/何时用，作为提示）、`category`。
- 注意：apps/code 当前依赖的是 `@n0n/skill`（单数，见 package.json），而 skill 发现 API 在 `@n0n/skills`（复数）。落地时需确认两者关系——可能需要给 apps/code 增加 `@n0n/skills` 依赖，或通过现有 `@n0n/skill` 的 `listSkills` 拿到等价数据（skill-inject.ts 已在用 listSkills，需核对其返回是否含 alias/description/activation）。
- `getSkillDirs()` 目前在 apps/n0n-skill 的 paths.ts（builtin + user 两个目录），apps/code 需要等价的目录解析逻辑。

**双框联动布局**（参考包 `demo/mention.ts` 的多 owner 范式，扩展为三 owner）：
- owner `input`：TextInput 输入区
- owner `menu`：候选列表，锚定在光标下方（用 Menu widget，items 为 `@name [alias]` 形式）
- owner `desc`：**描述框**，渲染在 menu 的左侧或右侧（视终端剩余宽度决定哪侧），显示当前 `selectedIndex` 对应 skill 的 `description`（自动折行到框宽）
- 上下键在 menu 中移动 `selectedIndex` 时，desc 框**实时同步**显示该项描述——这是体验关键。
- 选中（Enter/Tab）插入 `@name`，关闭两个框；Esc 取消。
- 三个 owner 共享同一 Grid，靠 Ownership 模型互不干扰；Viewport 统一管理整块动态区高度，受边界二硬约束（总高 ≤ 终端可见行数，desc/menu 框高度需据此裁剪）。

**复杂度提示**：desc 框的左右择侧、折行、与 menu 高度对齐，以及 menu/desc 共同受终端高度约束，是这块的主要工程量。先做 menu（对等 mention demo），再叠加 desc 联动。

### 实现子顺序（阶段二内）
1. 状态栏（纯展示 + 宽度降级）
2. @ 补全 menu（行首触发 + skill 数据接入 + 插入）
3. desc 描述框双框联动（择侧 + 实时同步 + 高度约束）

## 第三轮增强（review 后补强）

基于代码 review 的 5 点反馈，做了如下变更（各为独立 commit）：

### 1. 移除旧包 @n0n/multiline-input
迁移完成后旧 workspace 包仍残留且无任何消费者，已删除（commit 88d0705），lockfile 同步刷新。

### 2. @token 行首高亮
设计承诺用 TextInput.decorations 高亮 @token 但此前未实现。补上 `computeMentionDecorations`：每次 render 前扫描全文行首 @token 重算区间。

> **关键约束**：TextInput 的 decorations 是静态绝对 code unit offset，insertChar/deleteBeforeCursor **不会**自动平移它。若持久化存储区间，任何编辑（在 token 前插入/删除、删中间行）都会让高亮错位。因此采用「每次 render 重算」——成本仅为遍历各逻辑行，天然免疫一切编辑错位。

### 3. @mention 菜单滚动
此前 paintMenu 的 scrollTop 恒传 0，候选超过可见行数时选中项滚出即不可见；且 calcGridRows 未给菜单预留高度，单行输入时菜单可能完全画不出。修复：
- `calcMenuScrollTop`：滚动窗口跟随 selectedIndex，选中项始终可见。
- paintMenu 在上/下边框中央嵌 `▲`/`▼` 溢出提示。
- calcGridRows 增加 menuReserveRows 参数，菜单打开时为其预留高度（仍受终端高度硬约束 clamp）。

### 4. 输入区滚动溢出指示行
独立指示行显示「上方隐藏 ↑N 行 / 下方隐藏 ↓M 行」，dim 样式，**无溢出时隐藏不占高度**。
- `calcScrollOverflow` 据 `ti.scrollOffset` + 可见行数 + 全文视觉行数算上下隐藏行数。
- 布局两遍法：先按无指示行布局算溢出，若有溢出则输入区让出 1 行重排并重算，避免「是否有指示行」与「可见行数」的循环依赖。

### 5. 输入区行号列 —— 暂不做
评估后搁置：行号需对应逻辑行（与状态栏 Ln 一致），但 TextInput.paint 不暴露每视觉行的 charIdx 映射，应用层要复制其折行逻辑才能推算逻辑行号，工作量集中且易与折行实现脱节。更适合未来作为 terminal-renderer 的内部组件直接提供。
