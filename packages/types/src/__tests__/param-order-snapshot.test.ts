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
import { PostArgsSchema } from "../tool-args.ts";

describe("schema shape 参数顺序", () => {
	it("PostArgsSchema 顺序: uri, body", () => {
		expect(Object.keys(PostArgsSchema.shape)).toEqual(["uri", "body"]);
	});
});
