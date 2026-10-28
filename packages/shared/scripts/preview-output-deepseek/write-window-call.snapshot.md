# assistant_tool_call — write://?prefix_lines 窗口写入（FIM）
<!-- model: deepseek, tag-style: deepseek -->

```
role: assistant
toolCalls: [
  {
    "id": "tc_w",
    "tool": "post",
    "args": {
      "uri": "write://src/config.ts?prefix_lines=2&suffix_lines=2",
      "body": "import { z } from \"zod\";\nimport type { Config } from \"./types\";\nexport const config = z.object({ x: z.string() });\nexport type Config = z.infer<typeof config>;\nexport default config;"
    }
  }
]

--- content ---
只改窗口中间的行，锚行原样保留。
```
