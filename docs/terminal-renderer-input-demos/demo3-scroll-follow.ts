/**
 * Demo 3 — 验证 H3（边界一）：用户上翻脱离底部后，新输出是否抢夺滚动
 *
 * 假设（你的判断）：终端只在视窗已停在底部时才"自动滚到底"；
 *   用户主动上翻、视窗脱离底部后，新输出不会把视窗拽回底部。
 *
 * 做法：持续每 500ms 在底部追加一行（带递增计数），共持续 ~20 秒。
 *   你在它输出过程中【用鼠标滚轮/Page Up 上翻】，观察：
 *   - 上翻后视窗是否停住不动（新行在底部积累但不拽你回去）→ H3 成立
 *   - 还是每追加一行就把你拽回底部 → H3 不成立（你的终端是"激进跟随"）
 *
 * 这个 demo 用普通 append（\n），不涉及光标定位，纯测终端滚动跟随策略。
 *
 * 运行：bun .temp/demo-cursor/demo3-scroll-follow.ts
 * 中途可 Ctrl+C 结束。
 */

const out = process.stderr;
out.write("[demo3] 将每 500ms 追加一行，持续约 20 秒。\n");
out.write("[demo3] 请在输出过程中用滚轮/PageUp 上翻，观察视窗是否被新输出拽回底部。\n");
out.write("[demo3] 先填充一屏历史方便上翻：\n");
for (let i = 0; i < 60; i++) {
	out.write(`history line ${String(i).padStart(3, "0")}\n`);
}

let n = 0;
const maxTicks = 40; // 40 * 500ms = 20s
const timer = setInterval(() => {
	n++;
	const ts = new Date().toISOString().slice(11, 23);
	out.write(`[tick ${String(n).padStart(3, "0")}] ${ts} 新追加行——若你在上翻，看视窗是否被拽下来\n`);
	if (n >= maxTicks) {
		clearInterval(timer);
		out.write("[demo3] 结束。\n");
	}
}, 500);
