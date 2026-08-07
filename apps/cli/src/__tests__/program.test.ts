import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import type { CodeRunOptions } from "@n0n/code";
import type { CliDependencies } from "../program.ts";
import { CliUsageError, createProgram } from "../program.ts";

interface Calls {
	code: CodeRunOptions[];
	scanGlobal: boolean[];
	scanProject: number;
	skill: Array<{ name: string; value?: unknown }>;
	config: unknown[];
	env: unknown[];
}

function setup(): { dependencies: CliDependencies; calls: Calls } {
	const calls: Calls = {
		code: [],
		scanGlobal: [],
		scanProject: 0,
		skill: [],
		config: [],
		env: [],
	};
	const dependencies: CliDependencies = {
		runCode: async (options) => {
			calls.code.push(options);
		},
		scanGlobal: async (detail) => {
			calls.scanGlobal.push(detail ?? false);
		},
		scanProject: async () => {
			calls.scanProject++;
		},
		showSkillHelp: async () => {
			calls.skill.push({ name: "help" });
		},
		showSkill: async (name) => {
			calls.skill.push({ name: "read", value: name });
		},
		initializeBuiltinSkills: async () => {
			calls.skill.push({ name: "init" });
		},
		installSkill: async (path) => {
			calls.skill.push({ name: "install", value: path });
		},
		createSkill: async (path) => {
			calls.skill.push({ name: "create", value: path });
		},
		showSkillList: async (options) => {
			calls.skill.push({ name: "list", value: options });
		},
		runConfig: (options) => {
			calls.config.push(options);
		},
		runEnv: (options) => {
			calls.env.push(options);
		},
	};
	return { dependencies, calls };
}

async function parse(
	dependencies: CliDependencies,
	args: string[],
): Promise<void> {
	await createProgram(dependencies).parseAsync(["bun", "n0n", ...args]);
}

describe("n0n Commander contract", () => {
	test("无参数启动交互模式", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, []);

		expect(calls.code).toEqual([
			{ mode: "interactive", workspace: resolve(".") },
		]);
	});

	test("-p 启动 one-shot 模式", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["-p", "修复 bug", "--workspace", "."]);

		expect(calls.code).toEqual([
			{
				mode: "oneshot",
				prompt: "修复 bug",
				workspace: resolve("."),
			},
		]);
	});

	test("存在的裸路径作为 workspace", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["."]);

		expect(calls.code).toEqual([
			{ mode: "interactive", workspace: resolve(".") },
		]);
	});

	test("不存在的裸参数返回 usage error", async () => {
		const { dependencies } = setup();

		await expect(
			parse(dependencies, ["definitely-not-a-command-or-path"]),
		).rejects.toBeInstanceOf(CliUsageError);
	});

	test("不注册 agent 子命令", () => {
		const { dependencies } = setup();
		const names = createProgram(dependencies).commands.map((command) =>
			command.name(),
		);

		expect(names).not.toContain("agent");
	});

	test("scan 参数按类型传递", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["scan", "global", "--detail"]);
		await parse(dependencies, ["scan", "project"]);

		expect(calls.scanGlobal).toEqual([true]);
		expect(calls.scanProject).toBe(1);
	});

	test("skill list 不退化为字符串参数", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["skill", "list", "--all", "--color"]);

		expect(calls.skill).toEqual([
			{ name: "list", value: { all: true, color: true } },
		]);
	});

	test("skill create 在 CLI 边界解析为 SkillLocation", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["skill", "create", "task/review/init"]);

		expect(calls.skill).toEqual([
			{
				name: "create",
				value: {
					category: "task",
					nameParts: ["review", "init"],
				},
			},
		]);
	});

	test("config/env 解析类型化 scope", async () => {
		const { dependencies, calls } = setup();

		await parse(dependencies, ["config", "local"]);
		await parse(dependencies, ["env", "global"]);

		expect(calls.config).toEqual([{ scope: "local" }]);
		expect(calls.env).toEqual([{ scope: "global" }]);
	});
});
