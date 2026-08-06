import { describe, expect, it } from "bun:test";
import { toAnthropicFormat } from "../format.ts";

describe("toAnthropicFormat", () => {
	it("丢弃没有 reasoningSignature 的 thinking assistant 消息", () => {
		const result = toAnthropicFormat([
			{
				role: "user",
				content: "继续",
			},
			{
				role: "assistant",
				content: "这是中断前已经输出的内容",
				reasoning: "这是仅用于展示的思考摘要",
			},
		]);

		expect(result.messages).toEqual([
			{
				role: "user",
				content: [
					{
						type: "text",
						text: "继续",
						cache_control: { type: "ephemeral" },
					},
				],
			},
		]);
	});

	it("不发送空的 user/assistant 消息", () => {
		const result = toAnthropicFormat([
			{ role: "user", content: "   " },
			{ role: "user", content: "", cacheBreakpoint: true },
			{ role: "assistant", content: "" },
			{ role: "assistant", content: "正常回答" },
		]);

		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]).toMatchObject({
			role: "assistant",
			content: [{ type: "text", text: "正常回答" }],
		});
	});

	it("保留有签名但 reasoning 为空的 thinking block", () => {
		const result = toAnthropicFormat([
			{
				role: "assistant",
				content: "",
				reasoningSignature: "sig_123",
			},
		]);

		expect(result.messages).toEqual([
			{
				role: "assistant",
				content: [
					{
						type: "thinking",
						thinking: "",
						signature: "sig_123",
					},
				],
			},
		]);
	});
});
