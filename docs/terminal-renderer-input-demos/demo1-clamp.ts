/**
 * Demo 1 — 验证 H1：相对上移是否被屏幕上边界钳制
 *
 * 假设：光标在屏幕第 0 行时，发 \x1b[NA（上移 N 行），光标停在第 0 行不进 scrollback。
 *
 * 做法：
 *  1. 先填满整屏并多溢出几行（强制把光标推到屏幕底部、顶部内容进 scrollback）
 *  2. 发一个超大的相对上移 \x1b[999A（远超屏幕高度）
 *  3. 在"光标当前所在行"原地写一个醒目标记
 *
 * 判读：
 *  - 若标记出现在【当前屏幕最顶行】→ 上移被钳制到屏幕顶（H1 成立，相对移动受视窗约束）
 *  - 若标记出现在更靠下（说明只上移了有限行）或导致错乱 → H1 不成立
 *
 * 运行：bun .temp/demo-cursor/demo1-clamp.ts
 */

const out = process.stderr;
const rows = out.rows ?? 24;
const cols = out.columns ?? 80;

out.write(`[demo1] terminal size = ${cols}x${rows}\n`);

// 1) 填满整屏 + 溢出，制造滚动，把顶部行挤进 scrollback
const overflow = rows + 5;
for (let i = 0; i < overflow; i++) {
	out.write(`filler line ${i} ${".".repeat(Math.max(0, cols - 20))}\n`);
}
// 此刻光标在屏幕最底行的下一行起点（终端已滚动）

// 2) 超大相对上移
out.write("\x1b[999A");
// 3) 回到行首并写标记
out.write("\r");
out.write("\x1b[2K"); // 清当前行
out.write("<<< MARKER: 上移999行后光标停在这里 >>>");

// 把光标移回底部，避免污染后续提示（下移足够多，终端会钳制到底）
out.write("\x1b[999B");
out.write("\r\n");
out.write("[demo1] 结束。请观察 MARKER 出现在屏幕的哪一行（最顶行？中间？）。\n");
