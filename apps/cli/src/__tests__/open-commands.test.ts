import { describe, expect, test } from "bun:test";
import type { ConfigPaths } from "@n0n/code/config";
import { selectConfigTargets } from "../config-command.ts";
import { selectEnvTargets } from "../env-command.ts";
import { buildOpenInvocation } from "../open.ts";

const CONFIG_PATHS: ConfigPaths = {
	globalConfigDir: "/global/.n0n",
	globalTomlPath: "/global/.n0n/config.toml",
	globalEnvPath: "/global/.n0n/.env",
	projectTomlPath: "/project/.n0n/config.toml",
	projectEnvPath: "/project/.n0n/.env",
};

describe("config/env targets", () => {
	test("all 仅在本地目录存在时包含本地配置", () => {
		expect(selectConfigTargets("all", CONFIG_PATHS, false)).toEqual([
			CONFIG_PATHS.globalTomlPath,
			CONFIG_PATHS.globalEnvPath,
		]);
		expect(selectConfigTargets("all", CONFIG_PATHS, true)).toEqual([
			CONFIG_PATHS.globalTomlPath,
			CONFIG_PATHS.globalEnvPath,
			CONFIG_PATHS.projectTomlPath,
			CONFIG_PATHS.projectEnvPath,
		]);
	});

	test("local scope 在本地目录不存在时失败", () => {
		expect(() => selectConfigTargets("local", CONFIG_PATHS, false)).toThrow(
			"本地配置目录不存在",
		);
		expect(() =>
			selectEnvTargets("local", "/global/.n0n", "/project/.n0n", false),
		).toThrow("本地配置目录不存在");
	});

	test("env all 仅在存在时追加本地目录", () => {
		expect(
			selectEnvTargets("all", "/global/.n0n", "/project/.n0n", false),
		).toEqual(["/global/.n0n"]);
		expect(
			selectEnvTargets("all", "/global/.n0n", "/project/.n0n", true),
		).toEqual(["/global/.n0n", "/project/.n0n"]);
	});
});

describe("open argv", () => {
	test("配置参数保留并在末尾追加目标路径", () => {
		expect(
			buildOpenInvocation(
				["code", "--reuse-window"],
				["/global/config.toml", "/project/config.toml"],
			),
		).toEqual({
			executable: "code",
			args: ["--reuse-window", "/global/config.toml", "/project/config.toml"],
		});
	});
});
