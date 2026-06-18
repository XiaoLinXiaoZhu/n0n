---
description: 环境变量/配置解析示例——用 zod 在启动时一次性解析配置。
activation: init
order: 213
---

# 环境变量/配置解析示例

```typescript
// 好：入口处解析，内部直接用
import { z } from "zod";

const Config = z.object({
  port: z.coerce.number().int().min(1).max(65535),
});

type Config = z.infer<typeof Config>;

const config = Config.parse(process.env); // 启动时一次性解析
// 后续代码直接用 config.port，类型保证合法
```
