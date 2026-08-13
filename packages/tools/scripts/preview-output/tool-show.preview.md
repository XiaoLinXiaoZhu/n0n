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
- working log: 内部工作日志，也用于公示决策。系统自动继续循环，用户不会被即时通知。需要用户现在看到并响应时，改用其他三种 type。
  content: 当前判断、支持该判断的证据、下一步动作。用于公示决策时另需给出：所做的决定、理由、被否决的替代方案及否决理由。
- ask user question: 向用户提问。系统暂停循环，等待用户答复。
  content: 先给推导过程与证据，再给 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明），写明选项之间的后果差异；有倾向时说明倾向哪一项及把握程度。必须自包含。
- request user assistance: 请求用户介入操作。系统暂停循环，等待用户响应。
  content: 障碍的具体现象、你无法自主解决的原因、需要用户执行的具体操作。必须自包含。
- final report: 本轮生产结束的正式交付。系统暂停循环，等待用户响应。
  content: 已完成的工作、验证结果及其证据、本轮做出的关键决策。假定用户不掌握此前上下文，必须自包含。

Validation is enforced — non-conforming calls will be rejected.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "show",
    "description": "Structured output tool. Users cannot see your reasoning, tool calls, or intermediate results — only show calls reach them.\n\nType values:\n- working log: 内部工作日志，也用于公示决策。系统自动继续循环，用户不会被即时通知。需要用户现在看到并响应时，改用其他三种 type。\n  content: 当前判断、支持该判断的证据、下一步动作。用于公示决策时另需给出：所做的决定、理由、被否决的替代方案及否决理由。\n- ask user question: 向用户提问。系统暂停循环，等待用户答复。\n  content: 先给推导过程与证据，再给 2-4 个选项（每个选项以 `## ` 开头为标题行，下一行写说明），写明选项之间的后果差异；有倾向时说明倾向哪一项及把握程度。必须自包含。\n- request user assistance: 请求用户介入操作。系统暂停循环，等待用户响应。\n  content: 障碍的具体现象、你无法自主解决的原因、需要用户执行的具体操作。必须自包含。\n- final report: 本轮生产结束的正式交付。系统暂停循环，等待用户响应。\n  content: 已完成的工作、验证结果及其证据、本轮做出的关键决策。假定用户不掌握此前上下文，必须自包含。\n\nValidation is enforced — non-conforming calls will be rejected.",
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
