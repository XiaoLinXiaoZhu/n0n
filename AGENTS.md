## report 格式

如果用户提供日志文件。则应该先读取：

[log](packages/shared/src/conversation-log/types.ts)
[text-message](packages/types/src/domain.ts)

这两个文件以了解日志格式。然后使用jq按需提取日志文件中的信息。

## 工具链

- 类型检查：`bun run tsgo --noEmit`（TypeScript 7.0 Beta）
- 运行测试：`bun test`
- 代码格式化/Lint：`bun run biome check --fix`
- 依赖管理：`bun add` / `bun remove`
