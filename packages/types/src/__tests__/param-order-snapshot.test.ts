/**
 * 参数顺序 snapshot 测试
 *
 * 验证所有工具参数的声明顺序与预期一致。
 * 顺序由 Zod schema 的 .shape 定义——Object.keys(schema.shape)
 * 即规范键序，与 tool-args.ts 中的字段声明顺序一致。
 *
 * 如果有人修改了 schema 的字段声明顺序，此测试在 CI 中失败。
 * 顺序影响 prompt cache 一致性。
 */

import { describe, expect, it } from "bun:test";
import {
	EditArgsSchema,
	ExecArgsSchema,
	ProgressArgsSchema,
	WriteArgsSchema,
} from "../tool-args.ts";

describe("schema shape 参数顺序", () => {
	it("ExecArgsSchema 顺序: script, runtime, cwd, waitfor", () => {
		expect(Object.keys(ExecArgsSchema.shape)).toEqual([
			"script",
			"runtime",
			"cwd",
			"waitfor",
		]);
	});

	it("WriteArgsSchema 顺序: path, content", () => {
		expect(Object.keys(WriteArgsSchema.shape)).toEqual(["path", "content"]);
	});

	it("EditArgsSchema 顺序: path, intent", () => {
		expect(Object.keys(EditArgsSchema.shape)).toEqual(["path", "intent"]);
	});

	it("ProgressArgsSchema 顺序: status, content", () => {
		expect(Object.keys(ProgressArgsSchema.shape)).toEqual([
			"status",
			"content",
		]);
	});
});
