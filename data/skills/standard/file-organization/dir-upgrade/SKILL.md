---
description: 文件→目录升级——拆分时用 index.ts 重新导出，保持外部引用不变。
activation: init
order: 114
---

# 文件 → 目录升级

当一个文件拆分为多个时，将原文件升级为同名目录，用 `index.ts` 作为重新导出入口，保持外部引用路径不变：

```
# 拆分前
src/user/service.ts    # 800 行，包含 CRUD + 权限 + 通知

# 拆分后
src/user/service/
  index.ts             # 仅重新导出公共 API
  crud.ts              # CRUD 操作
  permissions.ts       # 权限检查
  notifications.ts     # 通知发送
```

```typescript
// index.ts —— 只做聚合，不含逻辑
export { createUser, updateUser, deleteUser } from "./crud";
export { checkPermission, grantRole } from "./permissions";
export { sendWelcomeEmail } from "./notifications";
```

外部代码无需改动——`import { createUser } from "./service"` 仍然有效。内部每个子文件各司其职，write 重写无负担。
