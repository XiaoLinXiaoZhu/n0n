import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import {
	createStdinController,
	type StdinSource,
} from "../stdin-controller.ts";

class FakeStdin extends EventEmitter implements StdinSource {
	isRaw = false;
	readableFlowing: boolean | null = null;
	paused = true;
	rawModeCalls: boolean[] = [];
	pauseCalls = 0;
	resumeCalls = 0;

	setRawMode(mode: boolean): void {
		this.isRaw = mode;
		this.rawModeCalls.push(mode);
	}

	resume(): void {
		this.paused = false;
		this.resumeCalls++;
	}

	pause(): void {
		this.paused = true;
		this.pauseCalls++;
	}

	setEncoding(): void {}
}

describe("StdinController lifecycle", () => {
	test("dispose 恢复 raw/paused 状态并释放 data listener", () => {
		const stdin = new FakeStdin();
		const controller = createStdinController(stdin);

		expect(stdin.isRaw).toBe(true);
		expect(stdin.paused).toBe(false);
		expect(stdin.listenerCount("data")).toBe(1);

		controller.dispose();

		expect(stdin.isRaw).toBe(false);
		expect(stdin.paused).toBe(true);
		expect(stdin.listenerCount("data")).toBe(0);
		expect(controller.phase).toBe("idle");
	});

	test("dispose 可重复调用，不重复恢复资源", () => {
		const stdin = new FakeStdin();
		const controller = createStdinController(stdin);

		controller.dispose();
		controller.dispose();

		expect(stdin.pauseCalls).toBe(1);
		expect(stdin.rawModeCalls).toEqual([true, false]);
	});

	test("原本处于 flowing 状态时不主动 pause", () => {
		const stdin = new FakeStdin();
		stdin.paused = false;
		stdin.isRaw = true;
		stdin.readableFlowing = true;
		const controller = createStdinController(stdin);

		controller.dispose();

		expect(stdin.pauseCalls).toBe(0);
		expect(stdin.isRaw).toBe(true);
	});

	test("input 断开后恢复之前的 agent 状态", () => {
		const stdin = new FakeStdin();
		const controller = createStdinController(stdin);
		const signal = controller.beginAgent();
		const received: string[] = [];
		const disconnect = controller.connectInput((data) => received.push(data));

		stdin.emit("data", "hello");
		expect(received).toEqual(["hello"]);
		expect(controller.phase).toBe("input");

		disconnect();
		expect(controller.phase).toBe("agent");
		stdin.emit("data", "\x11");
		expect(signal.aborted).toBe(true);
	});
});
