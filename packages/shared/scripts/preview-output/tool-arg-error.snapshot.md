# tool_arg_error 消息（含 schema）
<!-- model: claude-sonnet-4-20250514 -->

```
role: tool
toolCallId: tc_err
toolName: post

--- content ---
<error>
Bad tool args — uri: Required

Expected schema:
{
  "type": "object",
  "properties": {
    "uri": {
      "type": "string"
    },
    "body": {
      "type": "string"
    }
  },
  "required": [
    "uri",
    "body"
  ]
}
</error>
```
