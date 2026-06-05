/**
 * UserPrompter — 用户输入 + 确认对话框
 *
 * 封装 stdin 控制器的 prompt/confirm 两种交互模式。
 * TTY 模式下通过 stdin raw-mode 实现行编辑；
 * 非 TTY 模式回退到 readline 接口。
 */

import { createInterface } from "node:readline";
import { label, style } from "@n0n/cli-ui";
import type { UserInputConfig } from "./multiline-input/config.ts";
import { readMultilineInput } from "./multiline-input/index.ts";
import type { StdinController } from "./stdin-controller.ts";

export class UserPrompter {
	private readonly stdin: StdinController | null;
	private readonly userInputConfig: UserInputConfig | undefined;

	constructor(
		stdin: StdinController | null,
		userInputConfig?: UserInputConfig,
	) {
		this.stdin = stdin;
		this.userInputConfig = userInputConfig;
	}

	/** 显示提示符并等待用户输入一行文本。EOF 时返回 null。 */
	async prompt(): Promise<string | null> {
		if (!this.stdin) {
			return new Promise<string | null>((resolve) => {
				const rl = createInterface({
					input: process.stdin,
					output: process.stderr,
				});
				rl.question("", (answer) => {
					rl.close();
					resolve(answer || null);
				});
				rl.once("close", () => resolve(null));
			});
		}

		const result = await readMultilineInput({
			prompt: `${label.user()}`,
			hint: style.gray("(Alt+Enter 提交)"),
			editor: this.userInputConfig,
			connectStdin: (handler) => {
				this.stdin!.dataHandler = handler;
				this.stdin!.phase = "input";
				return () => {
					this.stdin!.dataHandler = null;
					this.stdin!.phase = "idle";
				};
			},
		});
		return result?.text ?? null;
	}

	/**
	 * 显示确认问题并等待用户输入。
	 *
	 * TTY 模式：在 raw mode 下直接实现行编辑，避免 readline 的
	 * emitKeypressEvents 在 stdin 上累积永久 listener。
	 *
	 * Ctrl+Q 等同于回答 "n" 并触发 abort。
	 */
	confirm(question: string): Promise<string> {
		if (!this.stdin) {
			return new Promise<string>((resolve) => {
				const rl = createInterface({
					input: process.stdin,
					output: process.stderr,
				});
				rl.question(question, (answer) => {
					rl.close();
					resolve(answer);
				});
				rl.once("close", () => resolve("n"));
			});
		}

		return new Promise<string>((resolve) => {
			process.stderr.write(question);
			let line = "";

			this.stdin!.dataHandler = (data: string) => {
				for (let i = 0; i < data.length; i++) {
					const code = data.charCodeAt(i);
					if (code === 17) {
						// Ctrl+Q → abort
						process.stderr.write("\n");
						this.stdin!.dataHandler = null;
						this.stdin!.phase = "agent";
						this.stdin!.abortController.abort();
						resolve("n");
						return;
					}
					if (code === 13) {
						// Enter
						process.stderr.write("\n");
						this.stdin!.dataHandler = null;
						this.stdin!.phase = "agent";
						resolve(line);
						return;
					}
					if (code === 127 || code === 8) {
						// Backspace
						if (line.length > 0) {
							line = line.slice(0, -1);
							process.stderr.write("\b \b");
						}
						continue;
					}
					if (code >= 32) {
						line += data[i];
						process.stderr.write(data[i] as string);
					}
				}
			};
			this.stdin!.phase = "input";
		});
	}
}
