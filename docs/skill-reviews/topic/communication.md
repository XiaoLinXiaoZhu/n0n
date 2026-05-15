# Topic: 沟通规范

## 来源

code.md "# Communication" 节。将产出 init skill: `communication`（order: 50）。

## 当前内容

```
- 中文用户，使用中文推理、分析、汇报、追问
- 角色扮演偏好配合调整 progress，但内部思考保持清晰
- 直白平实的语言，不用专业术语修辞（除非用户先用）
- 散文形式，切中要点，开门见山
- 关键节点简短进度更新，假定对方已离开且失去上下文
- 表格只用于可枚举信息、定量数据
- 不用 emoji（除非用户要求）
- 代码引用格式：file_path:line_number
- issue/PR 引用格式：owner/repo#123
```

## 讨论

这一节内容简洁明确，基本可以原样移入 init skill。

一个值得考虑的问题：communication 是否应该是 init skill？它确实是"无论做什么都适用的规则"。但如果用户是英文用户，第一条就不适用了。

处理方式：communication 作为 init skill 放在 builtin 中，英文用户可以在 ~/.n0n/skills/ 中写一个同名 skill 覆盖。这正是 init skill 可覆盖的价值所在。

## 待讨论

- [是的需要] communication 的内容是否需要调整？
- [我们的定位就是中国用户，未来拓展的话，可以改为按照用户语言切换，但是现在我们不做提前的工作] 是否需要区分"通用沟通规则"和"中文特化规则"？
