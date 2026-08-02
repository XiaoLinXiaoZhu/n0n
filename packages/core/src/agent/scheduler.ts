/**
 * ExecutionScheduler — 流水线工具执行调度器
 *
 * 有序队列 + 队首条件等待，并行性自然涌现。
 * 各工具通过 canStart 回调声明自己的并行条件，scheduler 不感知具体工具语义。
 *
 * 通过 SchedulerEvents 回调发射 raw 无序事件，排序职责由消费者（Renderer）自行决定。
 */

import type { ToolJob } from "@n0n/tools";
import type {
	ToolArgErrorMessage,
	ToolCallRecord,
	ToolExecOutcome,
	ToolResult,
} from "@n0n/types";

// ── 事件回调接口 ──

export interface SchedulerEvents {
	onRegister(tc: ToolCallRecord): void;
	onChunk(tcId: string, tool: string, chunk: string): void;
	onEnd(tcId: string, outcome: ToolExecOutcome): void;
}

// ── PipelineJob — discriminated union ──

interface JobBase {
	job: ToolJob;
}

export interface PendingJob extends JobBase {
	status: "pending";
}

export interface RunningJob extends JobBase {
	status: "running";
}

export interface CompletedJob extends JobBase {
	status: "completed";
	result: ToolResult;
}

export interface FailedJob extends JobBase {
	status: "failed";
	argError: ToolArgErrorMessage;
}

export type PipelineJob = PendingJob | RunningJob | CompletedJob | FailedJob;

// ── JobSlot — mutable wrapper，避免 index 间接寻址 ──

class JobSlot {
	state: PipelineJob;
	constructor(state: PipelineJob) {
		this.state = state;
	}
}

// ── ExecutionScheduler ──

export class ExecutionScheduler {
	private readonly slots: JobSlot[] = [];
	private readonly pendingQueue: JobSlot[] = [];
	private readonly activeSet = new Set<JobSlot>();
	private sealed = false;
	private notify: (() => void) | null = null;
	private readonly events: SchedulerEvents | null;

	constructor(events?: SchedulerEvents) {
		this.events = events ?? null;
	}

	enqueue(job: ToolJob): void {
		const slot = new JobSlot({ status: "pending", job });
		this.slots.push(slot);
		this.pendingQueue.push(slot);
		this.events?.onRegister(job.call);
		this.notify?.();
	}

	seal(): void {
		this.sealed = true;
		this.notify?.();
	}

	orderedJobs(): readonly PipelineJob[] {
		return this.slots.map((s) => s.state);
	}

	async run(signal?: AbortSignal): Promise<void> {
		while (!signal?.aborted) {
			const head = this.pendingQueue[0];
			if (head) {
				const job = head.state;
				if (job.job.canStart(this.activeTCs())) {
					this.pendingQueue.shift();
					this.startJob(head);
					continue;
				}
			}

			if (
				this.sealed &&
				this.pendingQueue.length === 0 &&
				this.activeSet.size === 0
			) {
				break;
			}

			await new Promise<void>((r) => {
				this.notify = () => {
					this.notify = null;
					r();
				};
			});
		}
	}

	private activeTCs(): ToolCallRecord[] {
		return [...this.activeSet].map((s) => s.state.job.call);
	}

	// ── 执行启动 ──

	private startJob(slot: JobSlot): void {
		const { job } = slot.state;
		slot.state = { status: "running", job };
		this.activeSet.add(slot);
		this.runJob(slot, job);
	}

	private async runJob(slot: JobSlot, job: ToolJob): Promise<void> {
		const tc = job.call;
		let result: ToolResult | null = null;
		let argError: ToolArgErrorMessage | null = null;

		try {
			for await (const event of job.run()) {
				if (event.type === "tool_output_chunk") {
					this.events?.onChunk(tc.id, event.tool, event.chunk);
				} else if (event.type === "tool_arg_error") {
					argError = event;
				} else {
					result = event;
				}
			}
		} catch (err) {
			if (!result && !argError) {
				argError = {
					type: "tool_arg_error",
					callId: tc.id,
					tool: tc.tool,
					error: {
						kind: "internal_error",
						message: `Internal execution error: ${err instanceof Error ? err.message : String(err)}`,
					},
				};
			}
		} finally {
			if (argError) {
				slot.state = { status: "failed", job, argError };
			} else {
				slot.state = {
					status: "completed",
					job,
					result: result as ToolResult,
				};
			}
			this.activeSet.delete(slot);
			this.events?.onEnd(
				tc.id,
				argError
					? { status: "arg_error" }
					: { status: "completed", result: result as ToolResult },
			);
			this.notify?.();
		}
	}
}
