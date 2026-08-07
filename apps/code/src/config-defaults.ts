/** Code App 配置默认值的单一事实来源。 */

interface CodeSettingsDefaults {
	strip_hint: boolean;
	memory_tag: boolean;
	notify_sound: boolean;
	notify_sound_path: string;
	agent: {
		max_iterations: number;
		max_idle_rounds: number;
		default_exec_waitfor: number;
	};
	security: {
		blocked_commands: string[];
	};
	cli: {
		open_command: [string, ...string[]];
	};
	user_input: {
		max_width: number;
		max_height: number;
		align: "left" | "center" | "right";
	};
}

export const DEFAULT_CODE_SETTINGS: CodeSettingsDefaults = {
	strip_hint: true,
	memory_tag: false,
	notify_sound: false,
	notify_sound_path: "",
	agent: {
		max_iterations: 50,
		max_idle_rounds: 5,
		default_exec_waitfor: 120,
	},
	security: {
		blocked_commands: [],
	},
	cli: {
		open_command: ["code"],
	},
	user_input: {
		max_width: -1,
		max_height: -1,
		align: "left",
	},
};

export const DEFAULT_OPEN_COMMAND = DEFAULT_CODE_SETTINGS.cli.open_command;

export const DEFAULT_TOML = `
[settings]
strip_hint = ${DEFAULT_CODE_SETTINGS.strip_hint}
memory_tag = ${DEFAULT_CODE_SETTINGS.memory_tag}
notify_sound = ${DEFAULT_CODE_SETTINGS.notify_sound}
notify_sound_path = ${JSON.stringify(DEFAULT_CODE_SETTINGS.notify_sound_path)}

[settings.agent]
max_iterations = ${DEFAULT_CODE_SETTINGS.agent.max_iterations}
max_idle_rounds = ${DEFAULT_CODE_SETTINGS.agent.max_idle_rounds}
default_exec_waitfor = ${DEFAULT_CODE_SETTINGS.agent.default_exec_waitfor}

[settings.security]
blocked_commands = ${JSON.stringify(DEFAULT_CODE_SETTINGS.security.blocked_commands)}

[settings.cli]
open_command = ${JSON.stringify(DEFAULT_CODE_SETTINGS.cli.open_command)}

[settings.user_input]
max_width = ${DEFAULT_CODE_SETTINGS.user_input.max_width}
max_height = ${DEFAULT_CODE_SETTINGS.user_input.max_height}
align = ${JSON.stringify(DEFAULT_CODE_SETTINGS.user_input.align)}
`;
