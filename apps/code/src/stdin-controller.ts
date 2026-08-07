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
	readonly phase: StdinPhase;
	connectInput(dataHandler: (data: string) => void): () => void;
	beginAgent(): AbortSignal;
	abortAgent(): void;
	enterIdle(): void;
	/** 设置 Ctrl+P 回调（心跳暂停） */
	setPauseHandler(handler: (() => void) | null): void;
	dispose: () => void;
}

type RestorableStdinState =
	| { phase: "idle" }
	| { phase: "agent"; abortController: AbortController };

type StdinState =
	| RestorableStdinState
	| {
			phase: "input";
			dataHandler: (data: string) => void;
			previous: RestorableStdinState;
	  };

export interface StdinSource {
	isRaw?: boolean;
	readableFlowing: boolean | null;
	setRawMode(mode: boolean): void;
	resume(): void;
	pause(): void;
	setEncoding(encoding: BufferEncoding): void;
	on(event: "data", listener: (data: string) => void): unknown;
	removeListener(event: "data", listener: (data: string) => void): unknown;
}

export function createStdinController(
	source: StdinSource = process.stdin,
): StdinController {
	const wasRaw = source.isRaw ?? false;
	const wasFlowing = source.readableFlowing === true;
	let disposed = false;
	let state: StdinState = { phase: "idle" };
	let pauseHandler: (() => void) | null = null;

	const ctrl: StdinController = {
		get phase() {
			return state.phase;
		},
		connectInput: (dataHandler) => {
			const previous = state.phase === "input" ? state.previous : state;
			const inputState: StdinState = {
				phase: "input",
				dataHandler,
				previous,
			};
			state = inputState;
			return () => {
				if (state === inputState) state = previous;
			};
		},
		beginAgent: () => {
			const abortController = new AbortController();
			state = { phase: "agent", abortController };
			return abortController.signal;
		},
		abortAgent: () => {
			const agentState = getAgentState(state);
			agentState?.abortController.abort();
		},
		enterIdle: () => {
			state = { phase: "idle" };
		},
		setPauseHandler: (handler) => {
			pauseHandler = handler;
		},
		dispose: () => {
			if (disposed) return;
			disposed = true;
			source.removeListener("data", onData);
			pauseHandler = null;
			state = { phase: "idle" };
			source.setRawMode(wasRaw);
			if (!wasFlowing) source.pause();
		},
	};

	function onData(data: string) {
		switch (state.phase) {
			case "input":
				if (data.includes("\x10")) {
					pauseHandler?.();
					break;
				}
				state.dataHandler(data);
				break;
			case "agent":
				if (data.includes("\x11")) {
					state.abortController.abort();
				}
				break;
			case "idle":
				break;
		}
	}

	source.setRawMode(true);
	source.resume();
	source.setEncoding("utf8");
	source.on("data", onData);

	return ctrl;
}

function getAgentState(
	state: StdinState,
): Extract<RestorableStdinState, { phase: "agent" }> | null {
	if (state.phase === "agent") return state;
	if (state.phase === "input" && state.previous.phase === "agent") {
		return state.previous;
	}
	return null;
}
