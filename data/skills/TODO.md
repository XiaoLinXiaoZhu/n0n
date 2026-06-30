# Skills 结构优化 TODO

## 背景：DS V4 稀疏注意力机制

DeepSeek V4 的长上下文注意力分三层：

1. **细粒度层**：每 4 token 压缩为一个向量，indexer 从全文中选出最相关的 1024 项
2. **粗粒度层**：每 128 token 压缩为一个向量，共计 8000 个向量（覆盖约 100 万 token）
3. **本地层**：最后 128 token 获得完整注意力

粗粒度层的每个 128-token 向量是一个"摘要"——它代表这 128 个 token 的语义。当模型需要回忆某条规则时，indexer 先在粗粒度层定位相关的 128-token 块，再在细粒度层精确匹配 4-token 单元。

## 问题：碎片 skill 导致注意力块内容不内聚

当前有 14 个 init skill 低于 64 tokens：

| Skill | Tokens | 内容 |
|-------|--------|------|
| safety-no-sudo | 10 | 不使用 sudo |
| communication-no-emoji | 9 | 不使用 emoji |
| exec-isolated-install | 20 | 第三方库隔离安装 |
| communication-reference | 26 | 代码引用格式 |
| communication-plain-language | 34 | 使用直白语言 |
| file-organization-dir-structure | 35 | 保持扁平目录 |
| write-token-signal | 36 | token 成本信号 |
| safety-temp-dir | 37 | .temp/ 不删除 |
| git-proxy | 38 | 代理端口配置 |
| communication-language | 46 | 使用中文 |
| safety-bun-process | 50 | 不 killall bun |
| code-comment-why | 51 | 注释解释 WHY |
| code-comment-doc-sync | 58 | 改代码检查注释 |
| exec-data-processing | 63 | 脚本内处理输出 |

每个 skill 加上 `<skill name="xxx">` wrapper 约 28 tokens 的开销，但即使加上 wrapper，大多数仍不足 128 tokens。

**核心问题**：这些碎片 skill 在 token 流中互相紧邻，导致一个 128-token 粗粒度块内混杂了来自不同主题的内容。例如：

- 一个块可能同时包含 "不使用 sudo"（安全）+ "不使用 emoji"（通信）+ "代码引用格式"（通信）
- 当 indexer 将这 128 token 压缩为单个向量时，该向量不清晰地代表任何一个主题
- 模型需要回忆"安全约束"时，这个混杂块的相关度评分不够高，可能不被选中
- 模型需要回忆"通信规范"时，同样因为块内有无关安全内容而被稀释

简言之：**块内内容不内聚 → 粗粒度向量语义模糊 → indexer 检索精度下降**。

## 优化方向：合并同主题碎片，使每个块语义内聚

将同一主题的碎片 skill 合并为一个更大的 skill，使合并后的内容在 token 流中形成主题连贯的块。

### 建议合并方案

1. **safety 组**：safety-no-sudo (10) + safety-temp-dir (37) + safety-bun-process (50) = 97 tokens
   → 合并入 safety-reversibility 或新建 safety-environment，形成一个完整的"运行环境安全约束"块

2. **communication 基础组**：communication-no-emoji (9) + communication-reference (26) + communication-plain-language (34) + communication-language (46) = 115 tokens
   → 合并为单个 communication-basics skill，描述"基本通信规范"

3. **code-comment 组**：code-comment-why (51) + code-comment-doc-sync (58) = 109 tokens
   → 合并入 code-comment-should-write 或新建 code-comment-principles

4. **exec 组**：exec-data-processing (63) + exec-isolated-install (20) = 83 tokens
   → 合并入 exec-batch 或 exec-observe

5. **独立小项**：
   - file-organization-dir-structure (35) → 合并入 file-organization-principles
   - write-token-signal (36) → 合并入 write-tool
   - git-proxy (38) → 合并入 git-workflow

### 合并原则

- 合并后每个 skill 应 >= 128 tokens（至少填满一个粗粒度块）
- 合并的依据是**语义相关性**，不是机械凑数——同一个块的内容应该在"模型需要回忆它们"的时刻一起被需要
- 不追求精确对齐 128 的倍数（因为 wrapper 开销和相邻 skill 的排列会影响实际边界），而是确保每个 skill 足够厚实，不会被其他主题稀释
