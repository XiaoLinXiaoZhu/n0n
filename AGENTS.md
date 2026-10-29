## report 格式

如果用户提供日志文件。则应该先读取：

[log](packages/shared/src/conversation-log/types.ts)
[text-message](packages/types/src/domain.ts)

这两个文件以了解日志格式。然后使用jq按需提取日志文件中的信息。

## 工具链

全部内置于 Bun 1.4.4，不要引入 biome / prettier / eslint / tsc / turbo 等外部工具。

- 类型检查：`bun check`
- 运行测试：`bun test`
- 格式化与 import 排序：`bun fmt`（配置在 `bunfig.toml` 的 `[fmt]` 段）
- Lint：`bun lint`；批量修复用 `bun lint --fix`
- 提交前全量校验：`bun run ci`（`bun fmt --check` + `bun lint` + `bun check`）
- 依赖管理：`bun add` / `bun remove`

注意两点：

1. `bun fmt` / `bun lint` / `bun check` 会优先执行 package.json 中的**同名 script**，所以本仓库不定义这三个名字的 script；需要绕过时加 `--no-script`。
2. markdown 不在格式化范围内（`bunfig.toml` 的 `ignorePatterns` 已排除 `**/*.md`），不要用 `bun fmt` 去改 md。
