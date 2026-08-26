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
        "production record",
        "customer information required",
        "customer decision required",
        "customer action required",
        "qualified delivery",
        "production suspended",
        "production failed",
        "customer cancelled"
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
- production record: 记录有价值的结论、证据或生产决定；不需要客户新输入。系统显示并持久化，不提醒、不等待，并自动继续当前生产周期。
- customer information required: 需要客户提供其已经掌握、生产方无法自行取得的事实、要求、路径或背景。系统显示并持久化，提醒客户并等待答复。
- customer decision required: 需要客户选择、授权、接受风险或修订有效契约。系统显示并持久化，提醒客户并等待答复。
- customer action required: 需要客户在会话外完成生产方无法代做的操作。系统显示并持久化，提醒客户并等待答复。
- qualified delivery: 当前有效验收基线全部满足。系统显示并持久化合格交付，提醒客户并结束当前生产周期。
- production suspended: 当前基线未满足，但存在明确恢复条件；本周期不再等待客户。系统显示并持久化生产暂停，提醒客户并结束当前生产周期。
- production failed: 当前基线未满足，且当前订单边界内不存在有效完成路径。系统显示并持久化生产失败，提醒客户并结束当前生产周期。
- customer cancelled: 客户撤回订单且不要求验收现有产物。系统显示并持久化客户取消，提醒客户并结束当前生产周期。

The schema validates the type and content fields. You remain responsible for choosing the correct type and providing content that satisfies the active production standard.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "show",
    "description": "Structured output tool. Users cannot see your reasoning, tool calls, or intermediate results — only show calls reach them.\n\nType values:\n- production record: 记录有价值的结论、证据或生产决定；不需要客户新输入。系统显示并持久化，不提醒、不等待，并自动继续当前生产周期。\n- customer information required: 需要客户提供其已经掌握、生产方无法自行取得的事实、要求、路径或背景。系统显示并持久化，提醒客户并等待答复。\n- customer decision required: 需要客户选择、授权、接受风险或修订有效契约。系统显示并持久化，提醒客户并等待答复。\n- customer action required: 需要客户在会话外完成生产方无法代做的操作。系统显示并持久化，提醒客户并等待答复。\n- qualified delivery: 当前有效验收基线全部满足。系统显示并持久化合格交付，提醒客户并结束当前生产周期。\n- production suspended: 当前基线未满足，但存在明确恢复条件；本周期不再等待客户。系统显示并持久化生产暂停，提醒客户并结束当前生产周期。\n- production failed: 当前基线未满足，且当前订单边界内不存在有效完成路径。系统显示并持久化生产失败，提醒客户并结束当前生产周期。\n- customer cancelled: 客户撤回订单且不要求验收现有产物。系统显示并持久化客户取消，提醒客户并结束当前生产周期。\n\nThe schema validates the type and content fields. You remain responsible for choosing the correct type and providing content that satisfies the active production standard.",
    "parameters": {
      "type": "object",
      "properties": {
        "type": {
          "type": "string",
          "enum": [
            "production record",
            "customer information required",
            "customer decision required",
            "customer action required",
            "qualified delivery",
            "production suspended",
            "production failed",
            "customer cancelled"
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
