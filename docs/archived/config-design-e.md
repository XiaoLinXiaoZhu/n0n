# 方案 E：Named Providers + Role Assignment

## 核心思想

把"provider 是什么"和"用哪个 provider"拆成两个独立概念：

1. **Provider 定义** — 像通讯录一样注册所有可用的 LLM endpoint
2. **Role 分配** — 告诉系统每个角色（主 LLM、编辑器）使用哪个 provider
3. **`$VAR` 引用** — TOML 中通过 `$XXX` 引用环境变量（从 .env 加载），实现 secrets 分离

依赖关系单向：`config.toml → .env`（TOML 引用 env，env 不知道 TOML 的存在）。

---

## 文件结构

```
~/.n0n/
  config.toml       # 全局配置（providers + roles + app settings）
  .env              # secrets（API keys），gitignore

$PROJECT/
  .n0n/
    config.toml     # 项目级覆盖（只写差异）
  .env              # 项目级 secrets（可选）
```

只有两层：**global** 和 **project**。project 覆盖 global，无更多层级。

---

## 配置示例

### ~/.n0n/config.toml

```toml
# ── Provider 定义 ──

[providers.anthropic]
type = "anthropic"
base_url = "https://tokenhub.piegateway.me"
api_key = "$ANTHROPIC_KEY"              # 从 .env 读取
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
extends = "ppio"                        # 继承 ppio 的 type/base_url/api_key/backend_provider
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
llm = "anthropic"                       # 主 agent
editor = "flash"                        # 编辑器（不设则 fallback 到 llm）

# ── App 设置 ──

[settings]
strip_hint = true
notify_sound = false
```

### ~/.n0n/.env

```bash
ANTHROPIC_KEY=sk-ant-xxx
DEEPSEEK_KEY=sk-ds-yyy
PPIO_KEY=sk-ppio-zzz
```

### 项目级覆盖：$PROJECT/.n0n/config.toml

```toml
# 只写差异 — provider 定义从全局继承

[providers.project-editor]
extends = "flash"                     # 继承全局的 flash 配置
edit_backend = "freeform-patch"       # 但本项目 editor 用 freeform-patch

[roles]
llm = "deepseek"                      # 本项目主 LLM 用 deepseek
editor = "project-editor"             # editor 用项目级定义的 provider
```

---

## extends 继承

Provider 支持 `extends = "other"` 单层继承，子定义覆盖父定义的同名字段：

```toml
[providers.ppio]
type = "openai-compatible"
base_url = "https://api.ppio.com/openai"
api_key = "$PPIO_KEY"
backend_provider = "deepseek"
model = "deepseek/deepseek-v4-pro"
thinking = true

[providers.flash]
extends = "ppio"
model = "deepseek-v4-flash"     # 覆盖 model
thinking = false                 # 覆盖 thinking
# type, base_url, api_key, backend_provider 全部继承
```

解析规则：
- `{ ...parent_fields, ...child_fields }`（child 始终胜出）
- 支持链式继承（A extends B extends C），通过递归解析
- 环检测：A extends B extends A → 解析时报错
- 引用不存在的 parent → 报错并列出可用 provider 名

---

## $VAR 环境变量引用

TOML 中字符串值以 `$` 开头时，视为环境变量引用：

```toml
api_key = "$ANTHROPIC_KEY"    # 解析为 process.env.ANTHROPIC_KEY 或 .env 中的值
base_url = "https://..."       # 普通字符串，不解析
```

加载顺序：
1. 加载 `~/.n0n/.env` → 注入环境变量池
2. 加载项目 `.env`（如存在）→ 合并到环境变量池
3. 解析 TOML 时，`$XXX` 从环境变量池中查找

如果 `$XXX` 找不到对应值 → 报错："config.toml 引用了环境变量 ANTHROPIC_KEY，但未在 .env 或环境中找到"。

---

## 切换方式

```bash
# 临时切换（单次）
n0n --llm deepseek "任务"
# 等价环境变量
N0N_LLM=deepseek n0n "任务"

# 查看当前配置
n0n config show
# → roles.llm: anthropic (global)
# → roles.editor: flash (global)

# 列出可用 providers
n0n config providers
# → anthropic, deepseek, ppio, flash, sonnet
```

---

## 与当前系统的差异

| 维度 | 当前（N0N_PREFIX） | 方案 E |
|------|-------------------|--------|
| 切换机制 | `N0N_PREFIX=PPIO` → 扫描 `PPIO_LLM_*` | `N0N_LLM=ppio` → 查找 `providers.ppio` |
| Provider 定义 | 分散在 env vars 中，每个 prefix 完整复制 | 集中在 TOML，`extends` 消除重复 |
| Editor 分离 | `EDITOR_LLM_*` 独立键群，不跟随 prefix | `roles.editor` 指向任意 provider |
| Secrets | 混在 .env 中与配置不分 | .env 只存 secrets，TOML 通过 `$VAR` 引用 |
| Typo 检测 | 无（prefix 拼错静默失败） | provider name 不存在 → 明确报错 |
| 新增 provider | 需要手写全套 `XXX_LLM_*` env vars | 加一个 `[providers.X]` section |
| 层级 | global .env + project .env + process env | global + project，两层清晰 |

---

## Editor 角色的特殊性

Editor 有两种后端实现：

| 后端 | 适用模型 | 说明 |
|------|---------|------|
| str-replace | Claude, DeepSeek 等 | 用标准 LLMClient，通过 tool calls 执行 str_replace/view_file/submit |
| freeform-patch | GPT-4o-mini 等 | 用 ResponsesClient（OpenAI Responses API），更轻量 |

**关键设计：`edit_backend` 跟随 provider 定义，不是全局设置。**

```toml
[providers.flash]
extends = "ppio"
model = "deepseek-v4-flash"
edit_backend = "str-replace"      # 当此 provider 被用作 editor 时，使用 str-replace

[providers.gpt-mini]
type = "openai"
api_key = "$OPENAI_KEY"
model = "gpt-5.4-mini"
edit_backend = "freeform-patch"   # 当此 provider 被用作 editor 时，使用 freeform-patch
```

这样切换 `roles.editor` 时，后端自动跟随，不需要额外修改 settings：

```toml
[roles]
editor = "flash"      # → 自动用 str-replace
# editor = "gpt-mini" # → 自动切换为 freeform-patch
```

**默认值**：provider 未声明 `edit_backend` 时，默认 `"str-replace"`。

**Fallback 规则**：`roles.editor` 未设置时，fallback 到 `roles.llm` 指向的 provider。

---

## 解析流程（伪代码）

```
1. 合并 env（先于 TOML 解析）：
   envPool = { ...loadEnv("~/.n0n/.env"), ...loadEnv("$PROJECT/.env"), ...process.env }
   # 优先级：process.env > project .env > global .env

2. 加载 global config（用已合并的 envPool 解析 $VAR）：
   globalConfig = parseTOML("~/.n0n/config.toml", envPool)

3. 加载 project config（如存在）：
   projectConfig = parseTOML("$PROJECT/.n0n/config.toml", envPool)

4. 合并：
   merged = deepMerge(globalConfig, projectConfig)
   # project 的 providers/roles/settings 覆盖 global 同名键

5. 解析 extends：
   for each provider with extends:
     resolvedProvider = { ...resolveParent(extends), ...ownFields }

6. 解析 roles：
   llmProvider = merged.providers[cliOverride ?? merged.roles.llm]
   editorProvider = merged.providers[merged.roles.editor ?? merged.roles.llm]

7. 构造 ProviderConfig：
   llmConfig = toProviderConfig(llmProvider)
   editorConfig = toProviderConfig(editorProvider)
```

---

## 迁移路径

1. **Phase 1**：实现新配置解析器，与 runner.ts 并行存在
2. **Phase 2**：`n0n config migrate` 命令，读取现有 .env 生成 config.toml
3. **Phase 3**：新用户默认走 TOML；老用户检测到 .env 无 config.toml 时提示迁移
4. **Phase 4**：移除 N0N_PREFIX 支持

---

## 场景评分

| 场景 | 操作 | 步骤 |
|------|------|------|
| S1 首次设置 | `n0n config init` → 交互式生成 config.toml + .env | 1 命令 |
| S2 切换 provider | `--llm deepseek` 或 `N0N_LLM=deepseek` | 1 步 |
| S3 项目覆盖 | `.n0n/config.toml` 写 `[roles] llm = "X"` | 1 行 |
| S4 多 provider 定义 | 各写一个 `[providers.X]`，可用 extends | ~4 行/个 |
| S5 调试来源 | `n0n config show --verbose` | 1 命令 |
| S6 editor 分离 | `roles.editor = "flash"` | 1 行 |
| S7 secrets 分离 | .env 存 key，TOML 用 `$VAR` 引用 | 天然分离 |
| S8 新增配置键 | 加到 settings section + TypeScript 类型 | 2 处 |

---

## 实现复杂度估算

| 模块 | 行数 | 说明 |
|------|------|------|
| TOML 解析 + $VAR 替换 | ~50 行 | Bun 内置 TOML parser + 字符串替换 |
| extends 解析 | ~30 行 | 递归合并 + 环检测 |
| Role 解析 + ProviderConfig 构造 | ~80 行 | 类似当前 buildProviderConfigFromEnv |
| 两层合并（global + project） | ~30 行 | deepMerge |
| CLI override（--llm） | ~20 行 | 参数解析 |
| **总计** | ~210 行 | 比当前 runner.ts（~300 行）更简单 |

当前 runner.ts 的复杂度来自 prefix 扫描 + 多来源优先级 + inheritFrom 链。新方案用"名字查找"替代这些，逻辑更直接。
