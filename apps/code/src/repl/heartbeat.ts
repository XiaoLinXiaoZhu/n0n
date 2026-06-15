/**
 * REPL 心跳保活 — HeartbeatKeeper 工厂
 *
 * 独立于主循环，便于测试和调整阈值。
 */

import { isTTY, style, writeln } from "@n0n/cli-ui";
import { HeartbeatKeeper } from "@n0n/core";
import type { LLMClient } from "@n0n/types";

/**
 * 创建 HeartbeatKeeper（如果 client 支持 heartbeat）。
 * 返回 null 表示当前 provider 不支持心跳。
 */
export function createHeartbeatKeeper(
	client: LLMClient,
): HeartbeatKeeper | null {
	if (!client.heartbeat) return null;

	return new HeartbeatKeeper({
		sendHeartbeat: async (request) => {
			const usage = (await client.heartbeat?.(request)) ?? null;
			return usage !== null;
		},
		onTick: (count, maxCount) => {
			if (isTTY) {
				writeln(style.gray(`  ⏳ 缓存保活 (${count}/${maxCount})`));
			}
		},
		onExpired: (reason) => {
			if (isTTY) {
				const msg =
					reason === "max_count"
						? "达到上限"
						: reason === "error"
							? "请求失败"
							: "缓存已过期";
				writeln(style.gray(`  ⏸ 缓存保活已停止（${msg}）`));
			}
		},
	});
}
