---
description: 测试数据工厂——用带 overrides 参数的工厂函数创建测试数据。
activation: init
order: 245
---

# 测试数据工厂函数

多个测试文件有共同的准备逻辑时，提取为工具函数，放在测试目录下的 `test-utils` 或 `helpers` 文件中：

```typescript
// src/user/test-utils.ts
import { User } from "./user";

export const createTestUser = (overrides?: Partial<User>): User => ({
  id: "u_001",
  name: "测试用户",
  email: "test@example.com",
  role: "member",
  ...overrides,
});
```
