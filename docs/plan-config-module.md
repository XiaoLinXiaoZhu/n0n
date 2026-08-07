# 配置模块迁移规划

## 背景

当前配置实现位于 `apps/code`，统一 CLI 通过 `@n0n/code/config` 读取配置路径和
`settings.cli.open_command`。这使 `apps/cli` 反向依赖 Code Agent 的完整配置，
并导致 CLI 配置读取受到 LLM 等无关配置项校验结果的影响。

本规划仅记录后续迁移方案，本次不修改配置实现。

## 目标

- 新增 `apps/config`，包名为 `@n0n/config`，不注册独立 bin。
- 由 `apps/config` 统一拥有 n0n 产品级配置协议、默认值、路径和加载流程。
- `apps/cli` 与 `apps/code` 都依赖 `@n0n/config`，二者之间不再通过配置接口耦合。
- CLI 设置可以独立解析，不因 LLM 或 Code Agent 设置无效而丢失。
- 配置值在模块边界完成解析，调用方接收已经收窄的类型。

## 非目标

- 不改变现有 TOML 和 `.env` 的用户格式。
- 不增加独立的 `n0n-config` 命令。
- 不在迁移过程中重新设计 LLM、Agent 或安全配置字段。
- 不改变 `n0n config` 和 `n0n env` 的用户语义。

## 建议结构

```text
apps/config/
├── package.json
└── src/
    ├── defaults.ts
    ├── env.ts
    ├── index.ts
    ├── loader.ts
    ├── paths.ts
    └── schema.ts
```

职责：

- `defaults.ts`：默认 `config.toml`。
- `paths.ts`：全局和项目配置路径。
- `env.ts`：`.env` 文件读取及环境变量覆盖。
- `schema.ts`：n0n 产品级配置 Schema 和推导类型。
- `loader.ts`：默认、全局、项目配置的分层合并与来源追踪。
- `index.ts`：唯一公共导出入口。

## 依赖方向

```text
apps/cli  ──→ apps/config ──→ packages/*
apps/code ──→ apps/config ──→ packages/*
```

`apps/config` 可以依赖 `packages/llm` 等业务无关基础包，但不得依赖
`apps/cli` 或 `apps/code`。

## API 草案

```ts
export interface ConfigPaths {
	globalConfigDir: string;
	globalTomlPath: string;
	globalEnvPath: string;
	projectConfigDir: string;
	projectTomlPath: string;
	projectEnvPath: string;
}

export function resolveConfigPaths(workspace?: string): ConfigPaths;

export function loadN0nConfig(paths: ConfigPaths): ConfigLoadResult;

export function loadCliSettings(paths: ConfigPaths): CliSettingsLoadResult;
```

`loadCliSettings()` 只解析 CLI 所需字段，例如：

```ts
interface CliSettings {
	openCommand: readonly [string, ...string[]];
}
```

调用方不应再次检查数组是否为空，也不应使用类型断言把 `string[]` 强制转换为非空
tuple。非空约束必须在配置解析边界完成。

## 迁移范围

从 `apps/code` 迁移：

- `src/config-defaults.ts`
- `src/config-loader/loader.ts`
- `src/config-loader/paths.ts`
- `src/config-loader/schema.ts`
- `src/config-loader/index.ts` 中的公共配置导出

保留在 `apps/code`：

- `displayCodeConfig()` 及其他 Code Agent 专属终端展示。
- 将已解析设置转换为 LLM、tools、REPL 参数的组装逻辑。

保留在 `apps/cli`：

- Commander 命令注册。
- `global | local | all` scope 解析。
- 选择要打开的文件或目录。
- 启动外部编辑器。

## Parse, don’t validate 要求

- TOML、`.env`、CLI scope 和打开命令都必须在各自入口解析一次。
- 解析结果使用判别联合、枚举联合或非空 tuple 表达约束。
- 下游模块不得再次通过 `undefined` 检查、字符串比较集合或类型断言恢复约束。
- 配置错误应保留字段路径和来源，不降级为无结构字符串。
- `loadCliSettings()` 不得先加载完整 Code 配置再从中挑选 CLI 字段。

## 实施步骤

1. 建立 `@n0n/config` 包及测试。
2. 迁移配置路径、默认值、env 和 Schema。
3. 为完整配置和 CLI 设置建立独立解析入口。
4. 将 `apps/code` 改为依赖 `@n0n/config`。
5. 将 `apps/cli` 改为依赖 `@n0n/config`。
6. 删除 `@n0n/code/config` export 和原配置目录。
7. 更新文档、生成文件及 workspace 依赖。
8. 运行格式、类型检查和全量测试。

## 验收标准

- `rg '@n0n/code/config'` 无结果。
- `apps/cli` 不再因配置行为依赖 `@n0n/code`。
- 无效 LLM 配置不影响 `settings.cli.open_command`。
- `openCommand` 在 API 层面是非空 tuple。
- 全局与项目配置覆盖顺序保持不变。
- 配置来源追踪保持不变。
- `bun run biome check --fix`、`bun run tsgo --noEmit`、`bun test` 全部通过。
