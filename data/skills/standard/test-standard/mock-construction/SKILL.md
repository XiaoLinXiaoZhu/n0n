---
description: Mock/Stub 对象构造——在 test-utils 中提供轻量 fake。
activation: init
order: 246
---

# Mock / Stub 构造

```typescript
export const mockUserRepo = (): UserRepository => ({
  findById: async (id: string) => createTestUser({ id }),
  save: async () => {},
});
```

仅对不可控的外部依赖（网络、时钟、文件系统）使用 mock。优先使用真实对象或轻量 fake。
