---
description: 禁止使用 search-and-replace。说明原理、风险与替代工具。
activation: init
order: 130
---

# 禁止 Search and Replace

## 原则

任何时候都不应该使用 search-and-replace 的方式进行文件编辑。

## 原因

Search and replace 的问题不仅仅是转义麻烦：

1. **缺乏上下文感知**：纯文本替换不理解代码结构，无法区分字符串内的同名文本、不同作用域的同名标识符、注释中的匹配项
2. **脆弱性**：依赖精确的文本匹配，稍有格式差异（空格、换行、缩进）就匹配失败或产生错误结果
3. **不可审计**：替换结果无法预览，一旦出错需要手动逐处修复，尤其在批量操作时风险极高
4. **工具滥用**：在已有结构化文件写入工具（`write`）的前提下，search-and-replace 是一种降级操作

```typescript
// 假设你要重命名变量 user 为 account
// search-and-replace "user" -> "account" 会错误地命中：
//   - 字符串内的 "user"
//   - 注释中的 "user"
//   - 其他标识符中的 "user"（如 userName、getUser）
//   - JSON key "user"
```

## 替代方案

用 `write` 代替——声明式地输出目标状态，整体覆盖，不依赖文本匹配，从根源上避免上下文误判。具体用 write 改文件的决策（何时重写、何时先拆分、何时降级为 diff）见 write skill 的决策树。
