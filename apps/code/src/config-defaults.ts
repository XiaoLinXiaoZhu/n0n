/**
 * Code App 默认 TOML 配置
 *
 * 独立于 config-loader 的加载逻辑，
 * 便于修改默认值而不影响主流程代码。
 */

export const DEFAULT_TOML = `
[settings]
strip_hint = true
memory_tag = false
notify_sound = false
notify_sound_path = ""

[settings.agent]
max_iterations = 50
max_idle_rounds = 5
default_exec_waitfor = 120

[settings.security]
blocked_commands = []

[settings.user_input]
max_width = -1
max_height = -1
align = "left"
`;
