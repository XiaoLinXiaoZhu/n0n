# assistant_tool_call 消息（post 工具）
<!-- model: claude-sonnet-4-20250514 -->

```
role: assistant
toolCalls: [
  {
    "id": "tc_1",
    "tool": "post",
    "args": {
      "uri": "exec://sh/read-auth",
      "body": "cat src/auth.ts"
    }
  },
  {
    "id": "tc_2",
    "tool": "post",
    "args": {
      "uri": "write://test.txt",
      "body": "hi"
    }
  }
]

--- content ---
Let me read the file.
```
