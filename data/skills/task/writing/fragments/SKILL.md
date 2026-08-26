---
alias: writing-fragments
description: 通过穷举式提问从用户脑中挖掘碎片原料（claims、故事、锐利句子、半成型想法），追加到单一文件中。当用户说"碎片"、"发散"、"原料"或想在结构化之前先自由探索时使用。
activation: manual
---

# Writing Fragments

通过穷举式提问从用户脑中"挖矿"——产出 fragments（异质的写作原料）。

## 什么是 fragment

任何可能在最终文章中幸存的文本片段。标准是"这是一段好的写作吗？"而非"这是完整的论证吗？"

类型不限：锐利的句子、带论证的观点、小故事、半成型想法、引用、对话、抱怨、段子、代码片段、一组凭直觉聚在一起的观察。

## 文件格式

```markdown
# 工作标题

第一个 fragment。

可以是多段。可以包含列表、代码、引用——fragment 自然需要什么形态就用什么形态。

---

第二个 fragment。

---

> 一条想保留的引用。

对它的反应。
```

fragment 之间用 `---` 分隔。无标题、无标签、无排序。

## 行为规则

### 不施加结构

禁止阶段、大纲、分类。结构是后续 skill（writing-shape、writing-beats）的事。

### 静默追加

不问"可以加吗？"——加了就行，提一句"adding that"。在低风险写入场景中，不用 `show(customer decision required)` 打断对话节奏。

### 尊重用户编辑

每次写入前 observe 重读文件——用户可能已编辑、重排、删除。只追加，不覆盖。

### 从第一句话开始捕获

用户说的第一句话可能就是 fragment。不要等到"正式开始"。

### 用户可随时编辑

"删掉最后一个"、"把那个写得更锐利"、"合并这两个"——都是正常指令，立即执行。

## 交互节奏

这是一个对话式 skill。核心是持续提问、持续追加。

- 不需要频繁 `show(production record)`——碎片的积累是连续的，没有明确的步骤
- 客户确认现有 fragments 已满足本次目标时，用 `show(qualified delivery)` 报告数量和文件路径
- 客户接受缩减后的目标时，先将范围修订更新为有效契约；剩余范围验收通过后使用 `show(qualified delivery)`，
  并在正文明确说明范围修订已先更新有效契约。客户撤回且不验收现有文件时使用
  `show(customer cancelled)`；其他未满足情形按实际等待路径使用 `show(production suspended)` 或 `show(production failed)`
