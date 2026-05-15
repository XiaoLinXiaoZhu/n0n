# review (mattpocock, in-progress)

> 来源：mattpocock/skills/in-progress | 激活：auto

## A. 类型组成

**Methodology**（主要）。双轴 code review 流程，使用并行 sub-agent。

## B. 作用与核心思想

对 diff 进行两个独立维度的 review：
- **Standards 轴**——代码是否遵循项目的编码标准（CLAUDE.md, CONTRIBUTING.md, ADR, linter 配置）
- **Spec 轴**——代码是否忠实实现了 issue/PRD/spec 的要求

5 步流程：Pin fixed point → Identify spec source → Identify standards sources → Spawn both sub-agents → Aggregate。

关键设计：
1. **双轴独立**——两个维度分别报告，不合并不重排。一个变更可以"Standards pass, Spec fail"或反过来
2. **并行 sub-agent**——两个轴互不污染上下文
3. **每轴 < 400 words**——强制精简

核心思想：**Standards 和 Spec 是正交维度**。代码可以完美遵循规范但实现了错误的功能，也可以完美实现功能但违反规范。分开报告防止一个维度掩盖另一个。

## C. 与执行工具和 progress 的结合潜力

**高潜力但需要适配**。当前设计依赖 sub-agent，我们的系统没有。

如果整合进我们的系统（不用 sub-agent）：
- Pin fixed point → observe（git diff, git log）
- 收集标准和 spec → observe（读取 AGENTS.md, docs/ 等）
- Standards review → reason（对照标准逐条检查 diff）→ progress(working)
- Spec review → reason（对照 spec 逐条检查 diff）→ progress(working)
- 汇总 → progress(blocked)（呈现双轴报告，请用户确认发现）

**值得借鉴的内容**：双轴正交 review 的思路。即使不做完整的 review skill，"Standards 和 Spec 是独立维度"这个认知也值得记住。

## 人类评价

感觉可以简单处理为——拆分为三个 task（参考前面的task定义），一个 review-init，一个 review-spec 一个 review-standards。然后常规的流程就是 review-init → review-spec → review-standards，用户也可以选择只 review-spec 或者只 review-standards。这样的话我们可以：
- 保证每个阶段仅仅聚焦一部分内容
- 和 progress 机制结合，使得过程更加透明。

## AI 回应

拆分为三个 task 的思路很好。具体来说：

- **review-init**（Task）：pin fixed point, 收集 diff, 识别 spec 来源和 standards 来源。产出：diff 概览 + spec 引用 + standards 引用。用 progress(working) 报告准备工作完成。
- **review-spec**（Task）：对照 spec 逐条检查 diff。产出：缺失的需求、范围蔓延、实现偏差。用 progress(working) 报告。
- **review-standards**（Task）：对照 standards 逐条检查 diff。产出：规范违反列表。用 progress(working) 报告。

好处：
1. 每个阶段聚焦一件事，不会互相干扰
2. 用户可以只跑 review-spec 或只跑 review-standards
3. 每个阶段的 progress 报告让过程透明
4. 不需要 sub-agent——顺序执行三个阶段即可

这也是一个 task 可以组合的例子：review 是由三个子 task 组合而成的。