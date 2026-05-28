# Handoff: CLI 统一入口重构

## 概述

将 n0n 从多个独立 CLI 工具（`n0n`, `n0n-init`, `n0n-skill`）重构为单一入口 + 子命令结构。用户只需安装一个 `n0n` 包，通过子命令访问所有功能。

**分支建议**：`feat/unified-cli`  
**前置依赖**：配置系统重构完成后再做此任务（本任务会用到 `n0n config` 和 `n0n init`）

---

## 设计理念与原则

1. **单一入口**：用户只安装 `n0n`，所有功能通过子命令访问。不再有 `n0n-init`、`n0n-skill` 等独立二进制。
2. **默认是 agent**：无参数或第一个参数不是已知子命令时，全部路由给 agent。
3. **子命令集固定且小**：已知子命令数量有限（<10 个），易于记忆，不会与自然语言 prompt 冲突。
4. **内部模块化不变**：各 app 的代码逻辑不需要重写，只是入口从独立 bin 变成被 router import。
5. **开箱即用**：`bun install -g n0n` → `n0n init` → `n0n "your task"`，三步可用。

---

## 当前结构

```
apps/
  code/           # @n0n/code — bin: "n0n"（主 agent CLI）
  fairy/          # @n0n/fairy — 无 bin（Persistent AI Companion）
  n0n-init/       # @n0n/init — bin: "n0n-init"（环境发现工具）
  n0n-skill/      # @n0n/skill — bin: "n0n-skill"（skill 管理）
```

当前问题：
- 安装需要分别 link 多个包
- 系统提示词中引用 `n0n-init`、`n0n-skill` 等外部命令名
- 用户需要知道多个命令的存在

---

## 目标结构

### 子命令映射

```
n0n                       → agent 交互式 REPL
n0n "build a feature"     → agent 执行任务
n0n agent "task"          → 显式 agent（等价上面）
n0n agent --resume <file> → agent 恢复对话
n0n fairy                 → fairy 模式（persistent companion）
n0n init                  → 首次设置（配置 + skills 初始化）
n0n config                → 配置管理
n0n skill                 → skill 管理
n0n help                  → 帮助信息
```

### 路由规则

```typescript
const SUBCOMMANDS = ["agent", "fairy", "init", "config", "skill", "help"];

const args = process.argv.slice(2);
const first = args[0];

if (!first) {
  // 无参数 → agent 交互式 REPL
  runAgent(args);
} else if (SUBCOMMANDS.includes(first)) {
  // 已知子命令 → 分发，剩余参数透传
  dispatch(first, args.slice(1));
} else {
  // 未知子命令 → 视为 agent 任务 prompt
  runAgent(args);
}
```

**关键决策**：路由层不解析 flags（`--resume`, `--v` 等），全部透传给对应子命令处理。

### 文件结构变更

```
apps/
  cli/              # 新增：统一入口 router
    package.json    # bin: { "n0n": "src/main.ts" }
    src/
      main.ts       # 路由逻辑（~50 行）
      help.ts       # help 子命令（内置）
  code/             # 保留，但移除 bin 字段
    package.json    # 不再注册 "n0n" bin
    src/
      cli.ts        # 保留参数解析（--resume 等），但不再是全局入口
      index.ts      # 不变
  fairy/            # 保留，作为 "n0n fairy" 的实现
  n0n-init/         # 保留，移除 bin 字段，作为 "n0n init" 的实现
  n0n-skill/        # 保留，移除 bin 字段，作为 "n0n skill" 的实现
```

---

## Router 实现

### apps/cli/src/main.ts

```typescript
#!/usr/bin/env bun
/**
 * n0n CLI — 统一入口路由
 *
 * 解析第一个参数决定分发目标。
 * 非已知子命令 → 视为 agent prompt。
 */

const SUBCOMMANDS = new Set(["agent", "fairy", "init", "config", "skill", "help"]);

const args = process.argv.slice(2);
const first = args[0];

if (!first || !SUBCOMMANDS.has(first)) {
  // 无参数 or 不是子命令 → agent
  // 将原始 args 挂载到全局供 code app 读取
  (globalThis as any).__n0n_cli_args = args;
  await import("@n0n/code/entry");
} else {
  const rest = args.slice(1);
  (globalThis as any).__n0n_cli_args = rest;

  switch (first) {
    case "agent":
      await import("@n0n/code/entry");
      break;
    case "fairy":
      await import("@n0n/fairy/entry");
      break;
    case "init":
      await import("@n0n/init/entry");
      break;
    case "config":
      await import("@n0n/config-cli/entry");  // 新包，配置系统重构后创建
      break;
    case "skill":
      await import("@n0n/skill/entry");
      break;
    case "help":
      showHelp();
      break;
  }
}

function showHelp() {
  console.log(`n0n — AI Code Agent

用法:
  n0n "task"              执行任务
  n0n                     交互式 REPL

子命令:
  n0n agent [opts] [task] 代码 agent（默认）
  n0n fairy               持久对话伙伴
  n0n init                首次配置向导
  n0n config              配置管理
  n0n skill               skill 管理
  n0n help                显示此帮助

Agent 选项:
  --resume <file>         从对话日志恢复
  --save-every-loop       每轮自动保存对话
  --v <version>           切换提示词版本
  --expand-exec           展开 exec 输出
  --workspace <dir>       指定工作目录
`);
}
```

### apps/cli/package.json

```json
{
  "name": "n0n",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "n0n": "src/main.ts"
  },
  "dependencies": {
    "@n0n/code": "workspace:*",
    "@n0n/fairy": "workspace:*",
    "@n0n/init": "workspace:*",
    "@n0n/skill": "workspace:*"
  }
}
```

---

## 各 App 需要的改动

### apps/code

1. `package.json`：移除 `"bin"` 字段
2. 新增 `src/entry.ts`：从 `__n0n_cli_args` 读取参数（替代 `process.argv.slice(2)`）
3. `src/cli.ts`：参数解析逻辑保留，但读取来源改为 `__n0n_cli_args`

### apps/fairy

1. 新增 `src/entry.ts`：同上
2. `src/index.ts`：参数来源改为 `__n0n_cli_args`

### apps/n0n-init

1. `package.json`：移除 `"bin"` 字段
2. 新增 `src/entry.ts`：从 `__n0n_cli_args` 读取参数
3. 功能扩展：除现有 `global`/`project` 命令外，新增交互式配置向导（生成 config.toml + .env + skills 初始化）

### apps/n0n-skill

1. `package.json`：移除 `"bin"` 字段
2. 新增 `src/entry.ts`：从 `__n0n_cli_args` 读取参数

---

## `n0n init` 流程设计

`n0n init` 是面向新用户的首次设置体验：

```
1. 检查 ~/.n0n/ 是否存在
   - 已存在 config.toml → 提示 "已初始化，使用 n0n config 管理配置"
   - 不存在 → 继续

2. 创建 ~/.n0n/ 目录

3. 交互式配置向导：
   a. 选择主 LLM provider（anthropic / deepseek / openai / openai-compatible）
   b. 输入 API key
   c. 选择模型
   d. 可选：配置 editor provider（或使用默认）
   → 生成 config.toml + .env

4. 初始化 skills：
   将内置 skills 写入 ~/.n0n/builtin-skills/
   （复用现有 n0n-skill init 逻辑）

5. 验证 LLM 连通性（ping 测试）

6. 输出："✓ 初始化完成！运行 n0n \"your task\" 开始使用。"
```

---

## 系统提示词更新

当前系统提示词中引用的命令需要更新：

| 旧命令 | 新命令 |
|--------|--------|
| `n0n-init global` | `n0n init global`（或在 bootstrap hint 中直接说明） |
| `n0n-init project` | `n0n init project` |
| `n0n-skill` | `n0n skill` |
| `n0n-skill read <name>` | `n0n skill read <name>` |

需要搜索所有 `.md` 文件和 prompt 模板中的旧命令引用并更新。

---

## 发布模型

- **发布包**：只发布 `n0n`（apps/cli）
- **安装方式**：`bun install -g n0n`
- **内部依赖**：`n0n` 包依赖 `@n0n/code`, `@n0n/fairy`, `@n0n/init`, `@n0n/skill`（workspace 引用）
- 发布时通过 monorepo 打包工具将所有 workspace 依赖打入

---

## 验收标准

1. `bun link` 后全局只有一个 `n0n` 命令
2. `n0n` 无参数启动 agent REPL
3. `n0n "task"` 执行 agent 任务
4. `n0n skill list` 等价于旧 `n0n-skill list`
5. `n0n init` 完成首次设置（配置 + skills）
6. `n0n config show` 显示当前配置（依赖配置系统重构完成）
7. `n0n fairy` 启动 fairy 模式
8. `n0n help` 显示帮助
9. `n0n unknowncommand` 不报错，视为 agent prompt
10. 所有系统提示词中的命令引用已更新
