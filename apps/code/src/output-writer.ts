/**
 * OutputWriter — 暂停/停止时模型输出的持久化
 *
 * 记录两类事件，共享同一个递增编号序列：
 * - customer：模型调用 customer:// 暂停时 — 元数据头 + 模型文本 + customer 正文
 * - finished：agent 自然停止时 — 元数据头 + 模型文本
 *
 * 文件：<sessionDir>/output/{NN}-{slug|kind|finished}.md
 * 编号扫描 output/ 目录下已有的 NN- 前缀取 max+1（customer 与 finished
 * 共享序列；进程重启/恢复会话后编号自然接续）。
 *
 * 参照 mvp 分支 ShowWriter 的记录机制，在 post/scheme 架构上重建。
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { CustomerCompleted, DomainMessage } from "@n0n/types";

const OUTPUT_DIR = "output";
const SEQ_FILE_RE = /^(\d+)-/;

/** 各 kind 的记录标题（与 repl 渲染文案对齐） */
const KIND_TITLES: Record<CustomerCompleted["kind"], string> = {
  question: "❓ 问题",
  form: "✎ 请填写",
  action_required: "↗ 需要操作",
};

/** 从 history 中取末条 assistant_text（模型暂停/停止前的输出）。 */
export function lastAssistantText(
  history: readonly DomainMessage[],
): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i];
    if (message?.type === "assistant_text") return message.content;
  }
  return null;
}

function nowIso(): string {
  return new Date().toISOString();
}

export class OutputWriter {
  private readonly outputDir: string;

  constructor(sessionDir: string) {
    this.outputDir = resolve(sessionDir, OUTPUT_DIR);
  }

  /** 写一条 customer 暂停记录；模型文本与正文同文件。 */
  writeCustomer(result: CustomerCompleted, modelText: string | null): void {
    const uri =
      result.slug !== null
        ? `customer://${result.kind}/${result.slug}`
        : `customer://${result.kind}`;
    const content = [
      `<!-- n0n output | ${uri} | ${nowIso()} -->`,
      `# ${KIND_TITLES[result.kind]}`,
      "",
      "## 模型文本",
      "",
      modelText ?? "",
      "",
      "## 正文",
      "",
      result.call.args.body,
      "",
    ].join("\n");
    this.write(result.slug ?? result.kind, content);
  }

  /** 写一条自然停止记录；只有模型输出文本。 */
  writeFinished(modelText: string | null): void {
    const content = [
      `<!-- n0n output | finished | ${nowIso()} -->`,
      "# ✅ 已完成",
      "",
      modelText ?? "",
      "",
    ].join("\n");
    this.write("finished", content);
  }

  /** 分配编号并落盘；写入失败不阻断 REPL。 */
  private write(name: string, content: string): void {
    const seq = this.nextSeq();
    const filename = `${String(seq).padStart(2, "0")}-${name}.md`;
    try {
      if (!existsSync(this.outputDir)) {
        mkdirSync(this.outputDir, { recursive: true });
      }
      writeFileSync(join(this.outputDir, filename), content, "utf-8");
    } catch {
      // 写入失败不阻断 REPL
    }
  }

  /** 扫描 output/ 已有编号取 max+1；目录不存在或为空时从 1 开始。 */
  private nextSeq(): number {
    if (!existsSync(this.outputDir)) return 1;
    const seqs = readdirSync(this.outputDir)
      .map((name) => SEQ_FILE_RE.exec(name)?.[1])
      .filter((s): s is string => s !== undefined)
      .map(Number)
      .filter(Number.isFinite);
    return seqs.length > 0 ? Math.max(...seqs) + 1 : 1;
  }
}
