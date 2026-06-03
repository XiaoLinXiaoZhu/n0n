/**
 * StdinController — TTY raw-mode 输入状态机
 *
 * 避免多个组件反复争夺 stdin 控制权（add/remove listener、toggle raw mode）
 * 导致的 listener 累积和状态腐蚀。一个持久 listener + phase 路由替代。
 *
 * 三个 phase：
 * - idle: 忽略键盘输入
 * - input: 转发给 dataHandler（用户输入模式）
 * - agent: Ctrl+Q 触发 abort（agent 执行模式）
 *
 * Ctrl+P 在 input phase 下触发 onPause 回调（心跳暂停）。
 */

export type StdinPhase = "idle" | "input" | "agent";

export interface StdinController {
	phase: StdinPhase;
	dataHandler: ((data: string) => void) | null;
	abortController: AbortController;
	/** Ctrl+P 按下时调用（心跳暂停） */
	onPause: (() => void) | null;
	dispose: () => void;
}

export function createStdinController(): StdinController {
	const ctrl: StdinController = {
		phase: "idle",
		dataHandler: null,
		abortController: new AbortController(),
		onPause: null,
		dispose: () => {
			process.stdin.removeListener("data", onData);
			process.stdin.setRawMode(false);
		},
	};

	function onData(data: string) {
		switch (ctrl.phase) {
			case "input":
				if (data.includes("\x10")) {
					ctrl.onPause?.();
					break;
				}
				ctrl.dataHandler?.(data);
				break;
			case "agent":
				if (data.includes("\x11")) {
					ctrl.abortController.abort();
				}
				break;
			case "idle":
				break;
			default: {
				const _exhaustive: never = ctrl.phase;
				break;
			}
		}
	}

	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", onData);

	return ctrl;
}
