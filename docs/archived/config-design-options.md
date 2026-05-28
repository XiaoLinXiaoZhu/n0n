# n0n 配置系统设计方案

## 使用场景

| # | 场景 | 频率 | 当前痛点 |
|---|------|------|----------|
| S1 | **首次设置** — 新用户运行 n0n，需要配置 API key、provider、model | 1 次/用户 | bootstrap 交互式引导体验 OK |
| S2 | **日常切换 provider** — 在 Anthropic / DeepSeek / PPIO 之间切换 | 每天数次 | 需要改 N0N_PREFIX，但 prefix 下的键容易 typo 且无诊断 |
| S3 | **项目级覆盖** — 某个项目需要不同 model 或 endpoint | 偶尔 | 项目 .env 覆盖全局，但 prefix 与 override 语义含混 |
| S4 | **多 provider 定义** — 定义 Anthropic、DeepSeek、PPIO 三套配置 | 1 次/用户 | 每套需完整复制所有键到 DS_*、PPIO_*，手酸且易 typo |
| S5 | **调试配置来源** — "这个值到底从哪来的？" | 偶尔但关键 | 当前有 `[前缀切换]`、`[全局]` 标签，但不显示完整覆盖链 |
| S6 | **编辑 LLM 分离** — 主 agent 用 Opus，editor 用 Flash | 设置 1 次 | EDITOR_LLM_* 键群不跟随前缀覆盖（用户遇到的 bug） |
| S7 | **敏感信息分离** — API key 在单独文件（gitignore），其余配置可分享 | 1 次/用户 | 当前全在一个 .env，不支持拆分 |
| S8 | **新增配置键** — 开发者添加新配置项 | 每次迭代 | 需要在多个文件同步（env-spec.ts, common-specs.ts, config-from-env.ts） |

---

## 考量维度

| 维度 | 说明 | 量化方式 |
|------|------|----------|
| **操作次数** | 完成一个场景需要多少步操作（编辑、运行命令） | 步数 |
| **文件编辑次数** | 需要编辑多少个文件 | 文件数 |
| **溯源跳转次数** | 找到某个值来源需要几次"打开文件 → 查找 → 发现被覆盖 → 再打开" | 跳转次数 |
| **出错概率** | typo 或配置错误的可能性和能否被系统检测 | 低/中/高 + 有无诊断 |
| **学习成本** | 新用户理解配置机制需要多长时间 | 低/中/高 |
| **实现复杂度** | 开发和维护成本（解析器行数、依赖数） | 行数 + 依赖数 |
| **可扩展性** | 添加新的 provider 或配置键是否容易 | 低/中/高 |
| **独立可测试性** | 配置模块能否脱离完整 app 测试 | 是/否 |

---

## 方案 A：INI Profile Sections（参考 AWS CLI）

**格式**：标准 INI，`[profile NAME]` 定义命名配置组。

```ini
# ~/.n0n/config
[default]
llm_provider = anthropic
llm_base_url = https://tokenhub.piegateway.me
llm_api_key = sk-xxx
llm_model = claude-opus-4-6
llm_enable_thinking = true

editor_provider = openai-compatible
editor_model = deepseek-v4-flash

[profile DS]
llm_provider = deepseek
llm_model = deepseek-v4-pro
llm_enable_thinking = true
llm_thinking_effort = max
editor_model = deepseek-v4-flash

[profile PPIO]
llm_provider = openai-compatible
llm_base_url = https://api.ppio.com/openai
llm_api_key = sk-yyy
llm_model = deepseek/deepseek-v4-pro
```

**激活**：`N0N_PROFILE=DS n0n "任务"`

**加载顺序**：`default section → [profile X] overlay → project config → env vars`

| 场景 | 操作 | 步骤 |
|------|------|------|
| S1 首次设置 | 编辑 `~/.n0n/config`，填 `[default]` 下的 key/api_key/model | 编辑 1 个文件 |
| S2 切换 provider | `N0N_PROFILE=DS n0n` | 1 步（环境变量） |
| S3 项目覆盖 | 在 `./.n0n/config` 写覆盖值 | 编辑 1 个文件 |
| S4 多 provider | 在 `[default]` 旁添加 `[profile DS]`、`[profile PPIO]`，只写差异 | 编辑 1 个文件，每 profile ~4-6 行 |
| S5 调试来源 | `n0n config --provenance llm_provider` | 1 条命令 |
| S6 编辑 LLM 分离 | `[default]` 下设置 `editor_*`，profile 下覆盖 `editor_*` | 正常覆盖，无特殊处理 |
| S7 敏感信息分离 | import 支持需要额外实现；或手动分文件 | 2 个文件 |

**优点**：格式极其简单，用户熟悉（AWS CLI、SSH config、Git config），profile 语义清晰。

**缺点**：INI 不支持嵌套结构，扁平键名（`editor_provider` vs `editor.provider`）；无类型（全是 string）；section 头不支持 import。

---

## 方案 B：Kustomize 式 Base + Overlay（文件级组合）

**格式**：TOML。base 文件定义完整配置，overlay 文件只写差异。多文件合并。

```
~/.n0n/config/
  base.toml        # 完整默认配置
  ds.toml          # 只写: llm.provider = "deepseek"
  ppio.toml        # 只写: llm.provider = "openai-compatible"
```

```toml
# base.toml
[llm]
provider = "anthropic"
base_url = "https://tokenhub.piegateway.me"
api_key = "sk-xxx"
model = "claude-opus-4-6"
enable_thinking = true

[editor]
provider = "openai-compatible"
model = "deepseek-v4-flash"
enable_thinking = true

# profiles/ds.toml — 只写差异！
[llm]
provider = "deepseek"
model = "deepseek-v4-pro"
thinking_effort = "max"

[editor]
model = "deepseek-v4-flash"
```

**激活**：`N0N_OVERLAY=ds n0n`。加载：`base.toml → ds.toml (overlay) → project config → env`

| 场景 | 操作 | 步骤 |
|------|------|------|
| S1 首次设置 | 编辑 `base.toml` | 编辑 1 个文件 |
| S2 切换 provider | `N0N_OVERLAY=ds` | 1 步 |
| S3 项目覆盖 | `./.n0n/config.toml` 写覆盖 | 编辑 1 个文件 |
| S4 多 provider | 创建 `ds.toml`、`ppio.toml`，每个只写差异（~3-5 行） | 编辑 2 个小文件 |
| S5 调试来源 | `n0n config --provenance` 显示值来自 base 还是 overlay | 1 条命令 |
| S6 编辑 LLM 分离 | overlay 中覆盖 `[editor]` 即可 | 正常覆盖 |
| S7 敏感信息分离 | `secrets.toml` 在加载链中，可 gitignore | 天然支持 |

**优点**：差异文件极简（每个 profile 3-6 行）；文件级关注分离；secrets 天然隔离；新 profile 只需创建小文件。

**缺点**：文件数量多（N 个 profile = N 个文件）；需要知道"base 里有什么"才能写 overlay；没有 section 内的 `{{}}` 模板（但 overlay 模式不需要模板）。

---

## 方案 C：TOML with `[profile.X]` Sections（单文件，Cargo 风格）

**格式**：单个 TOML 文件，`[profile.X]` section 嵌套覆盖。

```toml
# ~/.n0n/config.toml

[llm]
provider = "anthropic"
base_url = "https://tokenhub.piegateway.me"
api_key = "sk-xxx"
model = "claude-opus-4-6"
enable_thinking = true

[editor]
provider = "openai-compatible"
model = "deepseek-v4-flash"

[profile.DS.llm]
provider = "deepseek"
model = "deepseek-v4-pro"
enable_thinking = true
thinking_effort = "max"

[profile.DS.editor]
model = "deepseek-v4-flash"
```

**激活**：`N0N_PROFILE=DS`

| 场景 | 操作 | 步骤 |
|------|------|------|
| S1 首次设置 | 编辑 `config.toml` | 编辑 1 个文件 |
| S2 切换 provider | `N0N_PROFILE=DS` | 1 步 |
| S3 项目覆盖 | `./.n0n/config.toml` 写覆盖 | 编辑 1 个文件 |
| S4 多 provider | 同一文件添加 `[profile.DS.llm]` 等 section | 编辑 1 个文件 |
| S5 调试来源 | 内置 provenance | 1 条命令 |
| S6 编辑 LLM 分离 | `[profile.DS.editor]` 覆盖 | 正常覆盖 |
| S7 敏感信息分离 | 需要 `import` 支持或手动拆分 | 需要额外机制 |

**优点**：单文件管理，TOML 类型安全，Bun.TOML.parse 内置，profile section 语义清晰。

**缺点**：profile 定义冗长（`[profile.DS.llm]` 每个嵌套都要写全路径）；敏感信息无法分离；添加新 profile 比方案 B 多写 section 头。

---

## 方案 D：分层文件 + Profile 目录（Docker Compose -f 风格）

**格式**：TOML，按层拆分为独立文件，profile 是可选覆盖层。

```
~/.n0n/config/
  default.toml      # 出厂默认值（包内置，不编辑）
  global.toml       # 用户全局配置
  secrets.toml      # API keys（gitignore）
  profiles/
    ds.toml         # DeepSeek 覆盖
    ppio.toml       # PPIO 覆盖

$PROJECT/.n0n/
  config.toml       # 项目级覆盖
```

**解析顺序**：`default.toml → secrets.toml → global.toml → [profile.toml] → project/config.toml → env vars`

**激活**：`N0N_PROFILE=ds` 自动加载 `profiles/ds.toml`

**CLI**：`n0n config` 子命令管理（list profiles, set key, show provenance）

| 场景 | 操作 | 步骤 |
|------|------|------|
| S1 首次设置 | `n0n config init`（交互式）→ 生成 `global.toml` + `secrets.toml` | 1 条命令 |
| S2 切换 provider | `n0n config use ds` 或 `N0N_PROFILE=ds` | 1 步 |
| S3 项目覆盖 | `n0n config set llm.model gpt-4o --local` | 1 条命令 |
| S4 多 provider | `n0n config profile create ds` → 编辑差异键 | 1 条命令 + 编辑 |
| S5 调试来源 | `n0n config provenance llm.provider` | 1 条命令 |
| S6 编辑 LLM 分离 | profile 中覆盖 editor 键 | 正常覆盖 |
| S7 敏感信息分离 | 天然支持（`secrets.toml` 独立文件） | 0 额外步骤 |

**优点**：secrets 天然隔离；每个文件职责单一；CLI 子命令消除手动文件操作；profile 文件极简（只写差异）；与 Docker Compose 模式一致，用户熟悉。

**缺点**：文件数量多；需要 CLI 子命令（额外实现工作）；过度工程化风险。

---

## 量化评分

| 维度 | A: INI Profile | B: Kustomize Overlay | C: TOML [profile.X] | D: 分层 + Profile 目录 |
|------|:-:|:-:|:-:|:-:|
| | | | | |
| **S2 切换操作** | 1 步 | 1 步 | 1 步 | 1 步 |
| **S4 新建 profile 编辑次数** | 编辑 1 文件 | 创建 1 文件(~5行) | 编辑 1 文件 | 创建 1 文件(~5行) |
| **S5 溯源跳转** | 1 步(CLI) | 1 步(CLI) | 1 步(CLI) | 1 步(CLI) |
| **S7 敏感信息分离** | ❌ 需额外机制 | ✅ 天然支持 | ❌ 需额外机制 | ✅ 天然支持 |
| **S8 新增键涉及文件数** | 2 (schema + parser) | 2 | 2 | 2 |
| | | | | |
| **Typo 诊断** | ✅ 未知 section 检测 | ✅ 未知 key 检测 | ✅ 未知 key 检测 | ✅ 未知 key 检测 |
| **独立可测试性** | ✅ | ✅ | ✅ | ✅ |
| **学习成本** | 低 (人人用过 INI) | 中 (需理解 overlay) | 低 (类似 Cargo) | 中高 (需理解分层) |
| **实现复杂度** | 低 (~100 行) | 低 (~150 行) | 低 (~100 行) | 中 (~250 行 + CLI) |
| **依赖** | 0 | 0 (Bun.TOML) | 0 (Bun.TOML) | 0 (Bun.TOML) |
| **格式类型安全** | ❌ 全 string | ✅ TOML | ✅ TOML | ✅ TOML |
| **单个 profile 的冗长程度** | 中 (~6 行) | 低 (~4 行) | 高 (~8 行 + section 头) | 低 (~4 行) |

---

## 关键洞察

1. **方案 A (INI) 和方案 C (TOML [profile.X]) 本质相同**，只是格式不同。两者都是单文件 + section 区分 profile。TOML 的优势是类型系统和嵌套键。

2. **方案 B 和方案 D 本质相同**，核心都是"base + 差异文件"。差异文件只写变化部分，天然解决 S7（secrets 分离）。区别是 D 多了 CLI 子命令。

3. **真正的分水岭是：单文件 vs 多文件**。单文件（A/C）简单但无法隔离 secrets、profile 冗长。多文件（B/D）灵活但需要文件管理。

4. **S6（编辑 LLM 分离）在所有方案中都天然解决**，因为一旦 profile overlay 机制是统一的（不再为 LLM_PROVIDER 特例），editor_* 键会自动被覆盖。

5. **当前配置系统的最大问题不是格式，而是解析流程**（双路径）。任何方案都需要统一的解析引擎。
