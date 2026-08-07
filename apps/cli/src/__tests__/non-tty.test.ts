// TODO: 为统一 CLI 补充确定性的非 TTY 集成测试。
//
// 测试应验证 stdin 为 pipe 时不会调用 setRawMode，也不会因缺少 TTY 能力崩溃。
// 测试必须注入 mock code runner / LLM，不得读取用户的真实配置或访问网络。
// 超时、初始化失败和无关异常不得视为测试通过。
// `--help`、`--version` 等纯 CLI 行为由 integration.test.ts 覆盖，无需在此重复。
