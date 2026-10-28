# tool_arg_error 消息（含 schema）
<!-- model: deepseek, tag-style: deepseek -->

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
