/**
 * Demo 2 — 验证 H2：滚动后基于内部记账的相对回移是否错位
 *
 * 这是模拟 Viewport：mount 预留 N 行 → 上移回起点 → 在 grid 内写内容 → render。
 * 但故意让"动态区高度 N"接近/超过终端高度，触发滚动，看 Viewport 风格的相对定位是否崩。
 *
 * 做法：
 *  1. 模拟 mount(N)：写 N 个 \n，再 \x1b[NA 上移，自认为回到了"动态区第 0 行"
 *  2. 模拟 render：moveTo(0,0) 即 \x1b[? 然后逐行写 "ROW k" 标记
 *  3. 故意把 N 设成 = 终端高度（边界情形），和 N = 终端高度+8（超高情形）各跑一次
 *
 * 判读：
 *  - N <= rows-1：每行 "ROW k" 应整齐对应，无错位
 *  - N >= rows：mount 的 N 个 \n 触发滚动，\x1b[NA 被钳制，render 写出的 "ROW k" 会
 *    错位/重叠/覆盖错误的行 → 证明 H2（超高时相对定位崩坏）
 *
 * 用法：bun .temp/demo-cursor/demo2-viewport-sim.ts <N>
 *   不传 N 时默认 N = rows（边界值）
 */

const out = process.stderr;
const rows = out.rows ?? 24;

const argN = Number(process.argv[2]);
const N = Number.isFinite(argN) && argN > 0 ? argN : rows;

out.write(`[demo2] terminal rows = ${rows}, 模拟动态区高度 N = ${N}\n`);
out.write("[demo2] 1 秒后开始模拟 mount+render...\n");

// 简单的同步等待，给用户时间看清起点
const start = Date.now();
while (Date.now() - start < 1000) {}

// ── 模拟 Viewport.mount(N) ──
let cursorRow = 0; // Viewport 的内部记账
for (let i = 0; i < N; i++) out.write("\n");
out.write(`\x1b[${N}A`); // 自认为回到动态区第 0 行
cursorRow = 0;

// ── 模拟 Viewport.render：从第 0 行起逐行写标记 ──
// moveTo(0,0)
function moveTo(row: number) {
	if (cursorRow > row) out.write(`\x1b[${cursorRow - row}A`);
	else if (cursorRow < row) out.write(`\x1b[${row - cursorRow}B`);
	out.write("\r");
	cursorRow = row;
}

moveTo(0);
for (let r = 0; r < N; r++) {
	moveTo(r);
	out.write("\x1b[2K");
	out.write(`ROW ${String(r).padStart(3, "0")} | 这是动态区第 ${r} 行，应整齐对应`);
}

// 收尾：移到动态区底部之后
moveTo(N - 1);
out.write("\x1b[999B\r\n");
out.write(
	`[demo2] 结束。判读：ROW 000..${N - 1} 是否每行整齐、无重叠/错位？\n`,
);
out.write(
	"[demo2] 若 N >= 终端行数，预期会错位/重叠（证明相对定位在超高时崩坏）。\n",
);
