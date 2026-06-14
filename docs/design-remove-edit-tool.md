# 移除 Edit 工具：设计决策与实施方案

## 核心论点

**Edit 工具没有存在的必要。** 在良好组织的代码库中，任何文件修改都等价于完整重写；对于遗留代码或外部约束文件，programmatic patching（diff/apply、jq、bun scripts）是更精确可控的替代方案。

## 推导过程

### 前提：文件组织原则

将 SOLID 的单一职责推到文件粒度——每个文件有且仅有一个修改理由。极端形式是函数化编程：每个函数单独作为一个文件导出。

在这种组织下：
- 单一函数必然导致文件短小
- 修改功能几乎总是需要改动文件 50%+ 的内容
- 因此修改 ≈ 完整重写，write 工具总是够用

### 为什么 write 优于 edit

| 维度 | write（声明式） | edit（意图驱动） |
|------|----------------|-----------------|
| 确定性 | 文件内容即输出内容，不可能失败 | 依赖 Editor LLM 解释意图，存在误读风险 |
| 关注点 | "文件应该长什么样" | "文件应该怎么改" |
| 复杂度 | 零——直接覆盖 | 高——需要额外 LLM 调用、多轮循环、补丁应用 |
| 成本 | Token 成本（但文件小则可忽略） | API 调用成本 + 延迟 |
| 可审计性 | git diff 直接展示变更 | 相同 |

核心洞察：**当我修改文件时，我更关心目标状态（"改成什么样"），而非变更路径（"怎么改"）。** Write 是声明式的——描述目标状态；edit 是命令式的——描述变更指令。声明式总是更安全。

### Edit 的降级替代方案

对于确实需要局部修改的场景（遗留代码、不值得重构的外部文件），使用 programmatic patching：

```
# 方案 1：unified diff + git apply（精确、支持多文件、支持创建/删除/重命名）
write(.temp/fix.patch, <unified diff content>)
act(git apply .temp/fix.patch)

# 方案 2：jq 处理 JSON
act(jq '.version = "2.0.0"' package.json > tmp && mv tmp package.json)

# 方案 3：bun runtime 做复杂的批量处理
act(runtime=bun, <programmatic file manipulation>)
```

**单个 diff 文件可以原子性地完成多文件操作：** 修改、创建、删除、重命名——全部通过一次 `write` + 一次 `git apply` 完成。

### Unified diff 为什么比 search & replace 更安全

S&R 只有内容维度——如果目标字符串出现多次，无法区分。

Unified diff 有两重定位：
1. **Hunk header 行号**——精确指定位置
2. **Context lines**——要求周围内容完全匹配

`git apply` 的策略是"失败而非猜测"——找不到匹配时直接报错，不会静默误应用。

唯一的理论风险需要同时满足：AI 生成错误行号 + 文件中存在完全相同的重复代码块 + offset 搜索命中错误副本。在良好结构的代码中，这三个条件不会同时成立。

### 双向飞轮效应

禁用 edit 不是单向因果，而是自我强化的循环：

```
禁用 edit → 迫使代码保持良好结构（坏结构让 write 变得痛苦）
     ↑                                    ↓
良好结构 ← edit 天然不被需要 ← 文件短小，write 无风险
```

禁用 edit 既是对 AI agent 的行为约束，也是对代码库结构质量的强制力。

### 决策树：面对需要修改的文件

1. **文件结构良好且小** → write 重写
2. **文件结构差** → 先重构为良好结构，然后 write
3. **外部约束的文件**（package.json, tsconfig, docker-compose）→ 领域专用工具（bun add, jq, etc.）
4. **遗留代码、不值得重构** → diff/patch 作为受控的降级方案（此路径应尽量避免）

没有一条路径需要 edit 工具。

## 系统简化收益

移除 edit 工具后：

1. **消除 Editor LLM 依赖** — 不再需要额外的 LLM 调用来解释编辑意图
2. **消除 ToolsConfig 复杂度** — 不再需要 editBackendType 的 discriminated union、editorClient/responsesClient 配置
3. **减少工具注册表体积** — 移除 edit 相关的定义、schema、流式执行器
4. **降低认知负担** — agent 的工具选择空间从 6 降到 5，决策更简单
5. **消除 str-replace 后端的多轮循环复杂度** — 那是一个完整的 agent-in-agent 子系统
6. **消除 freeform-patch 后端的 Responses API 依赖**
7. **配置简化** — 用户不再需要配置 `settings.editor` 的 provider

---

## 实施方案

### 分支策略

从 `mvp` 切出 `remove-edit-tool` 分支，直接大刀阔斧修改（git 历史可还原）。

### 实施步骤

#### Step 1: 删除 edit 模块本体

删除整个目录和相关测试：
- `packages/tools/src/edit/` — 整个目录
- `packages/tools/src/__tests__/edit.test.ts`
- `packages/tools/src/__tests__/freeform-patch-crlf.test.ts`

#### Step 2: 清理类型系统

- `packages/types/src/messages/tools/edit.ts` — 删除
- `packages/types/src/messages/tools/registry.ts` — 从 ToolMap 移除 edit、移除 EditToolCall 导出
- `packages/types/src/messages/tools/index.ts` — 移除 edit 相关 re-export
- `packages/types/src/tool-args.ts` — 移除 EditArgs、EditArgsSchema、EditParamDefs
- `packages/types/src/index.ts` — 移除 edit 相关导出
- `packages/types/src/client.ts` — 检查并清理
- `packages/types/src/__tests__/param-order-snapshot.test.ts` — 移除 edit 部分

#### Step 3: 简化工具注册表

- `packages/tools/src/index.ts` — 移除 edit 注册、EditBackend 实例化、相关 import/export
- `packages/tools/src/config.ts` — 简化 ToolsConfig（移除 editBackendType discriminated union，移除 editorClient/responsesClient）
- `packages/tools/src/write.ts` — 描述中移除 "For modifying existing files, use the edit tool instead"

#### Step 4: 清理格式化层

- `packages/shared/src/format-prompt/format-edit.ts` — 删除
- `packages/shared/src/format-prompt/index.ts` — 移除 edit case + import
- `packages/shared/scripts/preview-output/edit-result.snapshot.md` — 删除
- `packages/shared/scripts/preview-output-deepseek/edit-result.snapshot.md` — 删除
- `packages/shared/scripts/generate-format-snapshots.ts` — 移除 edit 相关

#### Step 5: 简化 core runtime

- `packages/core/src/runtime.ts` — 移除 EditBackendConfig、editBackend 参数
- `packages/core/src/index.ts` — 移除 EditBackendConfig re-export
- `packages/core/src/agent/tool.ts` — 移除 edit 从参数顺序表

#### Step 6: 简化应用层配置

- `apps/code/src/index.ts` — 移除 editor 配置解析、editBackend 构建
- `apps/code/src/headless.ts` — 移除 editBackend 参数
- `apps/code/src/config-loader.ts` — 从 settings schema 移除 editor、从显示函数移除 editor 展示

#### Step 7: 验证

- `bun run tsgo --noEmit` — 类型检查通过
- `bun test` — 测试通过
- `bun run biome check` — lint 通过
