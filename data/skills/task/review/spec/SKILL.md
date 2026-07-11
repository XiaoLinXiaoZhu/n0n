---
description: 对照 spec/PRD/issue 检查 diff，发现缺失需求、范围蔓延和实现偏差。需先完成 review-init。
activation: manual
---

# Review Spec

对照 spec 逐条检查 diff。

## 前置条件

review-init 已完成，你已知道 diff 命令和 spec 来源。如果无 spec，跳过本步骤并报告"无 spec 可审查"。

## 流程

### 1. 读取 spec

完整读取 spec/PRD/issue 内容。提取每一条需求或验收条件，编号备查。

### 2. 逐条检查

对照 diff，逐条判断：

- **缺失**：spec 要求了但 diff 中没有实现（或部分实现）
- **范围蔓延**：diff 中存在但 spec 没有要求的行为
- **实现偏差**：看起来实现了但实现方式与 spec 描述不一致

每条发现引用 spec 原文。

### 3. 产出报告

**退出 → 提交 `show(working log)`，格式：**

```
【阶段】Review Spec
【Spec 覆盖率】N/M 条需求已实现
【缺失需求】
  - 需求X（spec 原文引用）：未实现 / 部分实现（说明缺什么）
【范围蔓延】
  - 文件:行号：行为描述（spec 中无对应需求）
【实现偏差】
  - 需求Y（spec 原文引用）：实现方式与 spec 不一致（说明差异）
【结论】（总体评估）
```

无发现 → 明确报告"Spec 审查通过，未发现问题"。
