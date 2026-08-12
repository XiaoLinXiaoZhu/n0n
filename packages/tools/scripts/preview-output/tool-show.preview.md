# Tool Definition: show
<!-- generated for model: claude-sonnet-4-20250514 -->

## parameters

```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": [
        "working log",
        "ask user question",
        "request user assistance",
        "final report"
      ],
      "description": "Current report type"
    },
    "content": {
      "type": "string",
      "description": "Content for this report type"
    }
  },
  "required": [
    "type",
    "content"
  ],
  "additionalProperties": false
}
```

## description

````
Structured output tool. Users cannot see your reasoning, tool calls, or intermediate results — only show calls reach them.

Type values:
- working log: 内部工作日志。记录判断、证据、排除的替代方案。系统自动继续循环，用户不会被即时通知。如果需要用户现在看到并响应，使用其他三种 type。
  content: 
- ask user question: 向用户提问，等待选择。系统暂停循环，等待用户响应。
  content: 先展示推导上下文，再提供 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明）。必须自包含。
- request user assistance: 需要用户介入。系统暂停循环，等待用户响应。
  content: 说明障碍、无法自主解决的原因、需要用户执行的操作。必须自包含。
- final report: 任务完成，面向用户的正式交付。系统暂停循环，等待用户响应。详细说明已完成工作、验证结果、关键决策。假定用户已失去上下文，完整自包含。
  content: 

Validation is enforced — non-conforming calls will be rejected.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "show",
    "description": "Structured output tool. Users cannot see your reasoning, tool calls, or intermediate results — only show calls reach them.\n\nType values:\n- working log: 内部工作日志。记录判断、证据、排除的替代方案。系统自动继续循环，用户不会被即时通知。如果需要用户现在看到并响应，使用其他三种 type。\n  content: \n- ask user question: 向用户提问，等待选择。系统暂停循环，等待用户响应。\n  content: 先展示推导上下文，再提供 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明）。必须自包含。\n- request user assistance: 需要用户介入。系统暂停循环，等待用户响应。\n  content: 说明障碍、无法自主解决的原因、需要用户执行的操作。必须自包含。\n- final report: 任务完成，面向用户的正式交付。系统暂停循环，等待用户响应。详细说明已完成工作、验证结果、关键决策。假定用户已失去上下文，完整自包含。\n  content: \n\nValidation is enforced — non-conforming calls will be rejected.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "working log",
            "ask user question",
            "request user assistance",
            "final report"
          ],
          "description": "Current report type"
        },
        "content": {
          "type": "string",
          "description": "Content for this report type"
        }
      },
      "required": [
        "type",
        "content"
      ],
      "additionalProperties": false
    }
  }
}
```
