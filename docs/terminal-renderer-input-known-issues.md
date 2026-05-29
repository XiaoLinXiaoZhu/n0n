# terminal-renderer 多行输入 — 已知问题

> 状态：调查中，暂不向上游提交 issue（待进一步真实终端复现与根因确认）
> 依赖：`@xlxz/terminal-renderer@0.1.3`
> 涉及代码：`apps/code/src/multiline-input/reader.ts`
> 关联设计文档：[terminal-renderer-input-migration.md](./terminal-renderer-input-migration.md)

本文记录在多行输入 resize 处理中观察到的几个问题。核心触发场景是**调整终端窗口大小**。

---

## 现象总览

按一定频率调整窗口大小时，resize 重绘会"发生多次"，且底部出现残留行堆叠。经排查，这是下面**两个独立问题的叠加放大**，**不是数据竞态**：

- 慢节奏拖动时 debounce 每次都触发完整重绘（问题 A）
- 每次 resize 重绘后底部稳定残留一行（问题 C）

二者叠加：每慢拖一步触发一次完整 remount+render，每次又残留一行 → 多步拖动后残留逐行堆叠，视觉上像"内容反复发生 / 累积错乱"。

---

## 排除：不是数据竞态

JS 单线程，debounce 的 `setTimeout` 回调同步执行，不会重入；`resizeGridIfNeeded(true)` + `render()` 是同步序列，执行期间不会被另一个 resize 事件打断。

验证：连续 5 次不同宽度的 `remount` + `render`，每次 `remount` 写出的上移序列稳定为 `\x1b[2A`，不随次数漂移——VP 的 `cursorRow` 记账收敛，无累积错位。

所以"多次发生"是**事件被反复触发 + 每次有残留**，而非并发写终端的数据竞态。

---

## 问题 A：trailing debounce 在事件间隔 ≥ 延迟时每次都触发

### 现象

以略慢于 debounce 延迟（当前 300ms）的节奏持续拖动窗口，每一步都触发一次完整的 `remount` + `render`，视觉上是 resize 内容反复重画。

### 原因

`debounce` 是标准的 trailing-edge 实现——只合并"间隔小于延迟"的连续调用。一旦相邻事件间隔 ≥ 延迟，定时器在下一次调用前就已 fire，于是每次都执行。这是 debounce 的语义，**算法本身正确**，但它没有节流上限（throttle/maxWait），慢拖动场景下无法进一步合并。

### 证据

```
间隔 50ms（< 100ms 延迟）拖 10 次  → 触发 1 次（符合预期）
间隔 110ms（> 100ms 延迟）拖 10 次 → 触发 10 次（每次都超时）
间隔抖动 80/120 交替              → 触发 4 次
```

### 影响与现状

单独看不致命（resize 后重绘是正确行为），但与问题 C 叠加会放大残留。属于"可优化"，非"必须修"。

---

## 问题 B：debounce 缺少 cancel / flush（use-after-cleanup 风险）

### 现象

`debounce(fn, ms)` 返回的函数没有 `cancel`（或 `flush`）方法，挂起的定时器无法取消。消费方在 debounce 窗口内卸载（移除 `resize` 监听、`vp.clear/commit`、resolve 一次性流程）后，挂起回调仍会在 `ms` 后触发，向已结束的动态区 `render`、写已关闭的流。

### 相关代码（`@xlxz/terminal-renderer` 的 `viewport.js`）

```js
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(...args); }, ms);
  };
}
```

### 证据

```
typeof fn.cancel === "undefined"   // 无法取消
typeof fn.flush  === "undefined"
fn(); /* 消费方随即清理 */ await sleep(150); // 挂起回调仍 fire，calls === 1
```

### 我方现状

`reader.ts` 的清理路径 `disconnectStdin()` 只 `out.removeListener("resize", onResize)`——只阻止接收**新**事件，无法取消**已挂起**的定时器。在 submit/abort 恰好发生在一次 resize 后 300ms 内时，挂起回调会在组件 resolve 之后 fire。

### 可选缓解（我方，不依赖上游）

用自管定时器替代库的 debounce，在 cleanup 时 `clearTimeout`；或上游给 debounce 加 `cancel()`：

```js
debounced.cancel = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
```

---

## 问题 C：resize 后底部稳定残留一行（根因未锁定）

### 现象

真实终端中调整窗口尺寸后，`vp.remount(newCols, newRows)` 清理旧动态区时**稳定残留一行**（与变宽/变窄无关，固定差 1 行）。

### 相关代码（`Viewport.remount`）

```js
remount(newCols, newRows) {
  const reflowedHeight = this.grid.computeReflowHeight(newCols);
  const moveUp = this.cursorRow + (reflowedHeight - this.grid.rows);
  if (moveUp > 0) this.stream.write(`\x1b[${moveUp}A`);
  this.stream.write("\r");
  this.stream.write("\x1b[J");   // 从光标当前行清到屏底
  this.cursorRow = 0;
  const rows = newRows ?? this.grid.rows;
  this.grid.resize(newCols, rows);
  this.mount();
}
```

### 分析（未定论）

`\x1b[J` 从光标当前行清到屏底，要清掉整个动态区，上移量必须让光标回到动态区第 0 行。`moveUp = cursorRow + (reflowedHeight - grid.rows)`，其中 `reflowedHeight` 是旧内容按 **newCols** 回流的高度。但屏幕上的动态区是上次 `render` 按**旧 cols** 渲染的，物理占用恒为 `grid.rows` 行——用 newCols 回流高度修正"已按旧 cols 画好的屏幕"，方向上存疑。

但用纯网格内容（ASCII 不折行）实测时 `reflowedHeight === grid.rows`、`moveUp === cursorRow`，**shortfall 为 0，未复现残留**。所以纯网格场景下 remount 是对的。

根因疑似在 fake stream 测不到的层面：

1. **底部滚动锚点丢失**：`mount()` 写 `grid.rows` 个 `\n` 再 `\x1b[{rows}A` 上移。动态区贴近终端底部时，写 `\n` 触发终端滚动，上移无法回到原锚点，VP 记账的 `cursorRow` 与真实物理行差 1。
2. **`computeReflowHeight` 边界**：`Math.ceil(contentWidth / newCols)` 在含 CJK 或行恰好铺满列宽时是否少算一行。

### 复现骨架（纯网格 shortfall=0，未触发残留）

```ts
import { Grid, Viewport } from "@xlxz/terminal-renderer";

function fakeStream(cols: number, rows: number) {
  const buf: string[] = [];
  return { columns: cols, rows, write: (s: string) => (buf.push(s), true),
    dump: () => buf.join(""), clear: () => (buf.length = 0) };
}
const ROWS = 6;
function trial(oldCols: number, newCols: number, cursorRow: number) {
  const s = fakeStream(oldCols, 24);
  const grid = Grid.create(oldCols, ROWS);
  const vp = new Viewport(grid as any, s as any);
  vp.mount();
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < 10; c++) grid.setChar(r, c, "x", 0);
  vp.render({ row: cursorRow, col: 5 });
  s.clear();
  vp.remount(newCols, ROWS);
  const up = s.dump().match(/\x1b\[(\d+)A/);
  const got = up ? Number(up[1]) : 0;
  return { newCols, neededUp: cursorRow, moveUpEmitted: got, shortfall: cursorRow - got };
}
console.log(trial(80, 80, 2), trial(80, 120, 2), trial(80, 40, 2)); // 全部 shortfall: 0
```

### 曾尝试的临时 patch（已撤销）

在 resize 回调 remount 前写 `\x1b[1A\x1b[J` 手动上提一行清理边界，能补偿残留。但根因未锁定，为避免掩盖真实问题已撤销（commit `91e2e5e`）。待真实终端溯源后再决定修复位置（我方补偿 or 上游修 remount）。

---

## 下一步

- [ ] 真实终端中确认问题 C 的根因（重点：动态区贴近底部触发滚动时的锚点行为；含中文 / 行铺满列宽的边界）
- [ ] 决定问题 B 的缓解方式（我方自管定时器 + cleanup 清除，或推动上游加 `cancel`）
- [ ] 问题 C 根因明确后，再决定是否连同 A/B 一并向上游提 issue
