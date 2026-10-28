# write:// prefix/suffix 窗口写入（FIM 式）实施计划

## 状态

已实现（2026-10-29）。设计定稿于 2026-10-28 的方案评审对话；实现与本文一致，描述文案修订见「描述文案」一节。

## 背景与定位

### 与 design-remove-edit-tool.md 的关系（不推翻其核心论点）

`docs/design-remove-edit-tool.md` 论证了"编辑应声明式陈述终态，而非意图驱动的变更指令"。
本方案与之完全一致——它是 write 的**局部性优化**，不是 edit 工具复活：

- 仍然只陈述**终态**（窗口的新状态），不描述变更路径；
- 匹配失败即报错（fail-not-guess），不静默容错；
- 无 Editor LLM、无 diff 解析、无行号真理。

需要它的原因：该文档"良好组织下任何修改 ≈ 完整重写"的前提在实践中只对小文件成立。
大文件（遗留代码、生成代码、外部约束文件）full write 有真实痛点：token 浪费、
盲写风险、输出截断。窗口写入把 full write 的语义原样缩放到局部。

### 为什么不是 old/new 块或独立 edit scheme（决策记录）

评估过并否决的方案：

1. **old/new 块**（Aider search/replace 风格）：强制模型抄写变更行的旧版本 →
   锚定效应（倾向最小修补而非干净重写）、上下文出现文件的双份事实源、
   注意力沉没在精确抄写上；
2. **行号定位**：模型不重读就编辑时必然漂移；
3. **unified diff 作 body**：需要 patch(1) 级别的解析与 fuzz 兜底算法。

最终方案用 **FIM（fill-in-the-middle）心智模型**：模型只抄写**未变**的锚行，
变更区只写一次（终态）；"给定 prefix 和 suffix 产出中间"是模型训练原生操作。

## 最终契约

### URI

```
write://<path>[?prefix_lines=N][&suffix_lines=N]
```

- path：URL 编码的文件路径，相对路径解析到 workspace（现状不变）；
- 拆分规则：以第一个裸 `?` 切开 query，path 部分随后 URL 解码（`?` 的字面量写 `%3F`）；
- `prefix_lines` / `suffix_lines`：非负整数，缺省视为 0。

### body 结构

```
body = prefix（前 P 行）+ content（中间）+ suffix（后 S 行）
```

body 按行切分；要求 body 行数 ≥ P + S（窗口模式下违反 → parse 报错）。
prefix 取前 P 行，suffix 取**最后** S 行，其余为 content（可为空）。

### 语义表

| prefix_lines | suffix_lines | 行为 |
|---|---|---|
| 省略或 0 | 省略或 0 | **full write**：body = 整个文件，无匹配直接替换全文件 |
| 0 | S > 0 | 窗口从**文件头**开始：旧中间 = 文件开头到 suffix 匹配处 |
| P > 0 | 0 | 窗口延伸到**文件尾**：旧中间 = prefix 匹配处到 EOF |
| P > 0 | S > 0 | FIM：旧中间 = prefix 与 suffix 之间，替换为 content |

派生场景（均自然成立，无需特判）：

- **插入**：prefix 与 suffix 在文件中相邻，旧中间为空；
- **删除**：content 为空（body 恰为 P + S 行）；
- **空文件全写**：P = S = 0 且 body 为空。

### 匹配算法（精确匹配，无 fuzz）

P = S = 0：跳过匹配，直接全量写。

否则：

1. 在文件中找 prefix 段（P 行）的全部出现；
2. 对每个出现，从其下一行向后找 suffix 段（S 行）的首个出现；
3. **恰好一对**：旧中间 = prefix 结束与 suffix 开始之间的行，替换为 content，
   拼接其余部分写盘；
4. **零对**：`tool_arg_error`（invalid_args，path="body"），消息必须附上
   磁盘中该位置的实际内容，让模型一眼看到不匹配原因；
5. **多对**：`tool_arg_error`，提示扩大 `prefix_lines`/`suffix_lines` 消歧。

**已知并接受的限制**：旧中间内恰含 suffix 序列时 first-match 会切早。
低频（模型刚读过文件、上下文通常足够独特），与 Aider 同类风险，不做额外防护。

### 错误契约（自解释，教模型修复方向）

context 不匹配的错误消息必须包含修复指引，例如：

```
context lines must be unchanged — they are anchors. Put all changed lines
inside the window: enlarge prefix_lines/suffix_lines to cover them.
(file changed since your read? re-read and retry)
```

### 描述文案（writeScheme.describe + bodyHint 同步更新）

```
write — write://<path>?prefix_lines=P&suffix_lines=S . P/S are uri query
parameters — they belong after `?` in the uri; the body is file content
only, never parameter text. Body is the new state: the complete file by
default (both zero/omitted); windowed, the window's new state —
fill-in-the-middle: P unchanged anchor lines copied verbatim from the
file, then the new content, then S unchanged anchor lines (P and S are
independent counts). Example: to rewrite line 3 of a 5-line file —
write://f.txt?prefix_lines=2&suffix_lines=2, body = the file's lines 1-2,
then the replacement line, then its lines 4-5. Anchors must match the
file exactly; a body shorter than P+S lines or with mismatched anchors is
rejected — enlarge the window to cover all changed lines. write:// cannot
read files — to read one, use exec:// with a read script (e.g. cat or
type); reading is an intentional action performed through code execution.
```

修订 2026-10-29：实测发现模型可能把 prefix_lines/suffix_lines 误写进
body（uri 无 query 时被静默当作全量写入，body 原样覆盖文件）——文案
补充"参数属于 uri query、body 只放文件内容"的显式声明与 5 行文件
微型示例。

注意：描述文案变更会打破进行中会话的 prompt cache，commit message 注明（项目惯例）。

### 行尾与换行 pin（parse 边界定死）

- 匹配比较时剥掉行尾 `\r`（容忍 CRLF 文件与 body），**拼接与写盘统一 LF**；
- content 段原样拼接，末行换行由 body 自带内容决定，不做补全。

### recover（保持现状，一个必须的实现要求）

write 的 recover **保持现状行为**：截断的 uri+body 提取后仍写入，
标记 recovered / recover_failed（写入失败时）。

设计理由（用户决策）：即使工具层不落盘截断内容，流式预览也会将中间状态计入；
文件安全的根本方式是 git 管理历史，不在工具层叠加防护。

**唯一的实现要求**：recover 提取的 uri 现在也可能带 query——recover 必须按与
execute 相同的语义处理：

- 全写（无 query 或 P = S = 0）：现状不变，截断 body 原样写入；
- 窗口模式：同样走匹配-拼接（截断的 content 作为部分新状态拼入，标记 recovered）；
  body 少于 P + S 行、无法识别锚段时返回 null（判 unrecoverable）；
- **严禁**把窗口模式的截断 body 当作完整文件写入——那会把整个文件替换成一个
  窗口片段，是确定性损坏，与"中间状态可接受"是两回事。

### 调度

`resourceKey = path` 不变。窗口/全文件两种粒度同路径自动串行，免费获得。

### 流式预览（code app）

`CodeRenderer` 会把流式到达的 body 实时写入目标文件（编辑器实时预览）。预览
决定必须等 `uri` 的**字符串值闭合**（原始 args 中出现闭合引号）之后再做：
partial-json 会把被 chunk 截断的裸路径解析成合法的全量写 uri，提前锁定
targetPath 会让窗口写被误判成全量写，body（初始为空串）直接覆盖目标文件。
窗口写一律不预览；畸形 uri 也不预览（错误交给执行侧）。

## 非目标（明确不做，勿实现）

- **不加 `?base=<sha256>` 陈旧性前置条件**（用户明确暂无需求）；
- 不做 fuzz/模糊匹配（diff 解析、行号匹配、容差比较全部不做）；
- 不新增 scheme、不恢复 edit 工具；
- 不在结果消息中增加 windowed/mode 字段（YAGNI）。

## 实施步骤

1. `packages/tools/src/schemes/write.ts`
   - parse：拆 query、校验 prefix_lines/suffix_lines 为非负整数、
     窗口模式校验 body 行数 ≥ P+S，违规 throw（边界即解析，转 tool_arg_error）；
   - execute：按语义表分派 full / window；实现匹配-拼接逻辑；
   - recover：按上文"recover"一节处理 query 与窗口语义（行为本身保持现状）；
   - 同步文件头注释（"body 是完整内容"的旧表述已不准确）。
2. `packages/tools/src/schemes/write.ts` describe 与 bodyHint 按上文文案更新
   （描述由注册表组装，`exec/definition.ts` 无需改动，确认即可）。
3. 格式化层：`packages/format-prompt/src/format-file.ts` 及 renderer 中
   write 相关文案如有"完整文件内容"表述需同步。
4. 快照：`apps/code/src/__tests__/code-renderer-preview.test.ts` 等
   prompt 快照会因描述变更而失配，按既有脚本重新生成。
5. 测试（新增，建议 `packages/tools/src/__tests__/write-window.test.ts`）：
   - 全写回归：省略参数、显式 0/0；
   - 窗口替换 / 插入 / 删除；
   - 单侧 0：文件头、文件尾；
   - 零匹配报错且消息含磁盘实际内容；
   - 多匹配报错；
   - body 行数不足报错；
   - CRLF 文件容忍（匹配成功、写盘 LF）；
   - resourceKey：同路径窗口写与全文件写串行（toolkit 调度测试已有先例可参照）；
   - recover：全写截断仍写入标记 recovered；窗口截断（body ≥ P+S 行）按窗口语义
     拼入标记 recovered；窗口截断（body < P+S 行）返回 null。
6. 验证：`bun run tsgo --noEmit`、`bun test`、`bun run biome check --fix` 全绿。
