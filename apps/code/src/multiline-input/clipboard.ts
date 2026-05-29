/**
 * multiline-input clipboard — 跨平台系统剪贴板读取
 *
 * 用于 Ctrl+V 主动粘贴：当终端不支持 bracketed paste（不发 \x1b[?2004h 序列），
 * 或 Ctrl+V 被终端直接拦截走系统剪贴板时，作为兜底从系统剪贴板读取。
 *
 * 参考 @xlxz/terminal-renderer 的 demo/enhanced2/clipboard.ts。
 * 本模块只做读取（粘贴）；复制功能当前未用到，不实现。
 *
 * 注意：spawnSync 同步阻塞（powershell 启动有数十~数百 ms 延迟），
 * 仅在 Ctrl+V 这类低频用户动作时调用，可接受。
 */

import { spawnSync } from "node:child_process";

/**
 * 从系统剪贴板读取文本，失败返回 null。
 *
 * 平台命令：
 *  - win32：powershell -NoProfile -Command Get-Clipboard
 *  - darwin：pbpaste
 *  - linux：wl-paste（Wayland）→ xclip（X11）
 */
export function pasteFromClipboard(): string | null {
	try {
		if (process.platform === "win32") {
			const proc = spawnSync(
				"powershell",
				["-NoProfile", "-Command", "Get-Clipboard"],
				{ stdio: ["ignore", "pipe", "ignore"], timeout: 5000 },
			);
			if (proc.status === 0 && proc.stdout.length > 0) {
				// Get-Clipboard 末尾会附加 \r\n
				return proc.stdout.toString("utf-8").replace(/\r?\n$/, "");
			}
			return null;
		}
		if (process.platform === "darwin") {
			const proc = spawnSync("pbpaste", {
				stdio: ["ignore", "pipe", "ignore"],
				timeout: 3000,
			});
			if (proc.status === 0) {
				return proc.stdout.toString("utf-8").replace(/\n$/, "");
			}
			return null;
		}
		// linux: 先 Wayland 再 X11
		const wl = spawnSync("wl-paste", {
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 3000,
		});
		if (wl.status === 0) {
			return wl.stdout.toString("utf-8").replace(/\n$/, "");
		}
		const xc = spawnSync("xclip", ["-selection", "clipboard", "-o"], {
			stdio: ["ignore", "pipe", "ignore"],
			timeout: 3000,
		});
		if (xc.status === 0) {
			return xc.stdout.toString("utf-8").replace(/\n$/, "");
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * 把粘贴文本中的换行规范化为 \n（剪贴板可能含 \r\n 或裸 \r），
 * 供 TextInput 插入（其内部以 \n 表示换行）。
 */
export function normalizePastedText(text: string): string {
	return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}
