/**
 * Submit 完成提示音
 *
 * 默认关闭，通过配置开启。
 * 可指定自定义音频文件路径，未指定时使用内置的 knock-knock.wav。
 */

import { existsSync } from "node:fs";
import defaultSoundPath from "./assets/knock-knock.wav" with { type: "file" };

/** 提示音配置 */
export interface NotifyConfig {
	enabled: boolean;
	soundPath?: string;
}

/** 从 ConfigSource 构建 NotifyConfig */
export function buildNotifyConfig(source: Record<string, string>): NotifyConfig {
	const val = source.N0N_NOTIFY_SOUND;
	return {
		enabled: val === "1" || val === "true",
		soundPath: source.N0N_NOTIFY_SOUND_PATH || undefined,
	};
}

/** 播放提示音（异步、不阻塞、失败静默） */
export function playNotifySound(config: NotifyConfig): void {
	if (!config.enabled) return;

	const soundPath =
		config.soundPath && existsSync(config.soundPath)
			? config.soundPath
			: defaultSoundPath;

	try {
		const platform = process.platform;
		if (platform === "win32") {
			Bun.spawn(
				[
					"powershell",
					"-NoProfile",
					"-Command",
					`(New-Object Media.SoundPlayer '${soundPath}').PlaySync()`,
				],
				{ stdout: "ignore", stderr: "ignore" },
			);
		} else if (platform === "darwin") {
			Bun.spawn(["afplay", soundPath], {
				stdout: "ignore",
				stderr: "ignore",
			});
		} else {
			// Linux: paplay (PulseAudio) → aplay (ALSA)
			const player =
				Bun.spawnSync(["which", "paplay"]).exitCode === 0 ? "paplay" : "aplay";
			Bun.spawn([player, soundPath], {
				stdout: "ignore",
				stderr: "ignore",
			});
		}
	} catch {
		// 播放失败不应影响主流程
	}
}
