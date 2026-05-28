# Handoff: 配置系统重构

## 概述

将 n0n 的配置系统从当前基于环境变量前缀切换（`N0N_PREFIX`）的方案，重构为基于 TOML 的 Named Providers + Role Assignment 方案。

**分支建议**：`feat/config-toml`

---

## 设计理念与原则

遇到实现冲突时，以下原则优先级从高到低：

1. **单向依赖**：`config.toml → .env`。TOML 是配置的唯一来源，.env 只存储 secrets。TOML 通过 `$VAR` 语法引用 env，反方向永远不存在。
2. **命名实体 + 角色分配**：provider 是命名实体（定义一次），role 是指向关系（选择使用哪个）。不做 profile/overlay/merge。
3. **属性归属正确性**：每个配置字段放在它逻辑上应该归属的地方。`edit_backend` 是 provider 的属性（描述"用这个模型编辑时怎么调用"），不是全局设置。
4. **两层即够**：只有 global（`~/.n0n/`）和 project（`$PROJECT/.n0n/`）两层。不引入更多层级。
5. **显式优于隐式**：不做 magic env var 自动探测。如果用户需要环境变量控制 role，在 TOML 里显式写 `llm = "$MY_VAR"`。

---

## 当前系统分析

### 文件结构

```
packages/shared/src/bootstrap/
  runner.ts         — 主 bootstrap 流程（~300 行）
  common-specs.ts   — 环境变量定义（按 provider 动态构建）
  template.ts       — .env 模板生成
  index.ts          — 导出

packages/llm/src/
  config.ts         — ProviderConfig 类型定义（discriminated union）
  config-from-env.ts — env → ProviderConfig 工厂函数

apps/code/src/
  env-spec.ts       — Code Agent 的 EnvSpec 定义
  index.ts          — 入口，调用 bootstrap + 构造配置
```

### 当前痛点

| 问题 | 影响 |
|------|------|
| `N0N_PREFIX=PPIO` 扫描 `PPIO_LLM_*` 环境变量 | 拼错前缀静默失败，无诊断 |
| 每个 provider 需完整复制所有 `XXX_LLM_*` 键 | 手动维护 N 套变量，易出错 |
| `EDITOR_LLM_*` 不跟随前缀切换 | 已知 bug（S6） |
| Secrets 混在 .env 中与配置不分 | 无法安全共享配置 |
| 新增配置键需同步多个文件 | 开发摩擦大 |

---

## 目标设计

### 文件布局

```
~/.n0n/
  config.toml       # 全局配置
  .env              # secrets（API keys）

$PROJECT/
  .n0n/
    config.toml     # 项目级覆盖（只写差异）
  .env              # 项目级 secrets（可选）
```

### config.toml 完整示例

```toml
# ── Provider 定义 ──

[providers.anthropic]
type = "anthropic"
base_url = "https://tokenhub.piegateway.me"
api_key = "$ANTHROPIC_KEY"
model = "claude-opus-4-6"
thinking = true
thinking_budget_tokens = 10000

[providers.deepseek]
type = "deepseek"
base_url = "https://api.deepseek.com"
api_key = "$DEEPSEEK_KEY"
model = "deepseek-v4-pro"
thinking = true
thinking_effort = "max"

[providers.ppio]
type = "openai-compatible"
base_url = "https://api.ppio.com/openai"
api_key = "$PPIO_KEY"
backend_provider = "deepseek"
model = "deepseek/deepseek-v4-pro"
thinking = true

[providers.flash]
extends = "ppio"
model = "deepseek-v4-flash"
thinking = false
edit_backend = "str-replace"

[providers.sonnet]
extends = "anthropic"
model = "claude-sonnet-4-20250514"
thinking_budget_tokens = 5000

[providers.gpt-mini]
type = "openai"
api_key = "$OPENAI_KEY"
model = "gpt-5.4-mini"
edit_backend = "freeform-patch"

# ── Role 分配 ──

[roles]
llm = "anthropic"
editor = "flash"

# ── App 设置 ──

[settings]
strip_hint = true
notify_sound = false
```

### .env 示例

```bash
ANTHROPIC_KEY=sk-ant-xxx
DEEPSEEK_KEY=sk-ds-yyy
PPIO_KEY=sk-ppio-zzz
OPENAI_KEY=sk-oai-www
```

### 项目级覆盖示例

```toml
# $PROJECT/.n0n/config.toml
# 只写差异 — provider 定义从全局继承

[providers.project-editor]
extends = "flash"
edit_backend = "freeform-patch"

[roles]
llm = "deepseek"
editor = "project-editor"
```

---

## 核心机制详解

### 1. `$VAR` 环境变量引用

TOML 中字符串值以 `$` 开头时，解析为环境变量引用：

```toml
api_key = "$ANTHROPIC_KEY"    # → 从 envPool 查找 ANTHROPIC_KEY
base_url = "https://..."       # → 普通字符串，不解析
```

**解析时机**：所有 .env 加载完毕后，再解析 TOML 中的 `$VAR`。

**找不到时**：报错 `"config.toml 引用了环境变量 ANTHROPIC_KEY，但未在 .env 或环境中找到"`。

### 2. `extends` 继承

Provider 可通过 `extends = "parent_name"` 继承另一个 provider 的字段：

```toml
[providers.flash]
extends = "ppio"          # 继承 ppio 的所有字段
model = "deepseek-v4-flash"  # 覆盖 model
thinking = false             # 覆盖 thinking
# 其余字段（type, base_url, api_key, backend_provider）从 ppio 继承
```

**解析规则**：
- 合并方式：`{ ...resolveParent(extends), ...ownFields }`（child 始终胜出）
- 支持链式：A extends B extends C（递归解析）
- 环检测：A extends B extends A → 解析时报错
- 引用不存在的 parent → 报错并列出所有可用 provider 名
- `extends` 字段本身不保留在最终解析结果中

### 3. Role 分配与 Fallback

```toml
[roles]
llm = "anthropic"      # 主 agent 使用的 provider
editor = "flash"       # 编辑器使用的 provider
```

- `roles.llm` 必填（或通过 CLI flag `--llm` 覆盖）
- `roles.editor` 可选，未设置时 fallback 到 `roles.llm`
- Role 值必须是已定义的 provider 名，否则报错

### 4. `edit_backend` 属性

`edit_backend` 是 provider 级别的字段，描述"当此 provider 被用作 editor role 时，使用什么编辑后端"：

| 值 | 说明 |
|----|------|
| `"str-replace"` | 用标准 LLMClient，通过 tool calls 做 str_replace（默认值） |
| `"freeform-patch"` | 用 ResponsesClient（OpenAI Responses API） |

- 只在 provider 被分配给 `roles.editor` 时生效
- 未声明时默认 `"str-replace"`
- 不存在全局 `[settings].edit_backend`

### 5. 两层合并规则

```
global config + project config → merged config
```

合并策略：
- `providers`：project 可新增 provider，也可覆盖同名 provider（整个 section 替换）
- `roles`：project 的 role 覆盖 global 的同名 role
- `settings`：project 的 setting 覆盖 global 的同名 setting
- project 中定义的 provider 可 `extends` 全局的 provider

---

## 解析流程（精确步骤）

```
1. 合并 env（先于任何 TOML 解析）：
   envPool = { ...loadEnv("~/.n0n/.env"), ...loadEnv("$PROJECT/.env"), ...process.env }
   优先级：process.env > project .env > global .env

2. 解析 global TOML：
   globalConfig = parseTOML("~/.n0n/config.toml")
   对所有字符串值做 $VAR 替换（使用 envPool）

3. 解析 project TOML（如存在）：
   projectConfig = parseTOML("$PROJECT/.n0n/config.toml")
   同样做 $VAR 替换

4. 合并配置：
   merged = mergeConfigs(globalConfig, projectConfig)

5. 解析 extends（在合并后的 providers 集合上）：
   对每个有 extends 的 provider，递归解析为完整定义

6. 解析 CLI override：
   如果命令行传了 --llm <name>，覆盖 merged.roles.llm

7. 解析 roles → provider 查找：
   llmProvider = merged.providers[merged.roles.llm]   // 必须存在
   editorProvider = merged.providers[merged.roles.editor ?? merged.roles.llm]

8. 构造 ProviderConfig（复用现有类型）：
   llmConfig = toProviderConfig(llmProvider)
   editorConfig = toProviderConfig(editorProvider)
   editBackend = editorProvider.edit_backend ?? "str-replace"
```

---

## 类型设计

### TOML 结构对应的 TypeScript 类型

```typescript
/** TOML 文件解析后的原始结构 */
interface RawConfig {
  providers?: Record<string, RawProvider>;
  roles?: RawRoles;
  settings?: RawSettings;
}

interface RawProvider {
  extends?: string;
  type?: string;          // LLMProvider 类型
  base_url?: string;
  api_key?: string;
  model?: string;
  thinking?: boolean;
  thinking_budget_tokens?: number;
  thinking_effort?: string;
  backend_provider?: string;
  enable_thinking?: boolean;
  edit_backend?: string;  // "str-replace" | "freeform-patch"
}

interface RawRoles {
  llm?: string;           // provider 名
  editor?: string;        // provider 名（可选）
}

interface RawSettings {
  strip_hint?: boolean;
  notify_sound?: boolean;
  notify_sound_path?: string;
  blocked_commands?: string[];
}

/** extends 解析完毕后的 provider（所有字段已填充） */
interface ResolvedProvider {
  type: LLMProvider;
  base_url: string;
  api_key: string;
  model: string;
  thinking?: boolean;
  thinking_budget_tokens?: number;
  thinking_effort?: string;
  backend_provider?: string;
  enable_thinking?: boolean;
  edit_backend?: "str-replace" | "freeform-patch";
}
```

### 与现有类型的映射

`ResolvedProvider` → 现有 `ProviderConfig`（packages/llm/src/config.ts）的转换：

```typescript
function toProviderConfig(resolved: ResolvedProvider): ProviderConfig {
  // 根据 resolved.type 构造对应的 discriminated union 分支
  // 逻辑与当前 buildProviderConfigFromEnv 相同，只是数据源从 env 变成了 resolved object
}
```

---

## 需要修改的文件

| 文件 | 变更 |
|------|------|
| `packages/shared/src/bootstrap/` | 新增 `config-toml.ts`（TOML 解析 + extends + $VAR），修改 `runner.ts` 调用新解析器 |
| `packages/llm/src/config-from-env.ts` | 保留（向后兼容），新增 `config-from-toml.ts` |
| `apps/code/src/index.ts` | 从新配置系统获取 ProviderConfig，替换 buildLLMConfigFromEnv 调用 |
| `apps/code/src/env-spec.ts` | 迁移完成后可删除 |
| `packages/shared/src/bootstrap/common-specs.ts` | 迁移完成后可删除 |

### 新增文件

| 文件 | 职责 |
|------|------|
| `packages/shared/src/config/parse.ts` | TOML 解析 + $VAR 替换 |
| `packages/shared/src/config/resolve.ts` | extends 解析 + 环检测 |
| `packages/shared/src/config/merge.ts` | 两层合并 |
| `packages/shared/src/config/index.ts` | 统一入口：loadConfig(globalDir, projectDir?) → ResolvedConfig |
| `packages/shared/src/config/types.ts` | RawConfig, ResolvedProvider 等类型 |

---

## 迁移策略

1. **新旧并存**：新配置系统实现后，检测 `~/.n0n/config.toml` 是否存在：
   - 存在 → 走新系统
   - 不存在 → 走现有 .env 系统（保持向后兼容）
2. **迁移命令**：`n0n config migrate` 读取现有 .env，生成 config.toml + 新 .env（只含 secrets）
3. **最终移除**：确认迁移完成后，移除 `N0N_PREFIX` 相关代码

---

## 验收标准

1. `~/.n0n/config.toml` 存在时，系统正确解析并启动
2. `$VAR` 引用能从 .env 和 process.env 中正确解析
3. `extends` 正确继承字段，环引用报错
4. 项目级 config.toml 正确覆盖全局
5. `roles.editor` 未设时 fallback 到 `roles.llm`
6. `edit_backend` 跟随 editor provider 定义
7. 引用不存在的 provider name 时给出清晰错误信息
8. 现有 .env 系统在无 config.toml 时仍然正常工作
