---
description: 文件/模块组织原则。单一职责、短小文件、拆分策略。
activation: init
order: 110
---

# 文件与模块组织

## 核心原则

每个文件只做一件事。打开任何一个文件，能一眼看到全部内容，无需滚动。

## 为什么短小

- **定位快**：文件名即索引，不需要在 2000 行中搜索
- **理解快**：全部内容在屏幕上，上下文不丢失
- **修改安全**：改一个小文件影响范围小，review 轻松
- **测试友好**：一个模块对应一组测试文件，追加和删除都简单

## 拆分信号

以下任一情况出现时，就应该拆分：

- 文件超过 150-200 行（硬指标）
- 打开后需要滚动才能看完
- 文件内的函数/类分属不同的关注点（CRUD + 权限 + 通知混在一起）
- 修改一个功能要改动文件中的多个不连续区域
- 用 `write` 重写这个文件时觉得"太浪费 token"

## 拆分策略

按自然边界划分，选择最清晰的维度：

- **按功能/领域**：`auth.ts`、`profile.ts`、`billing.ts`
- **按职责**：`service.ts`、`repository.ts`、`dto.ts`
- **按类型变体**：对 union/sum type 的每个分支可各一个文件
- **测试文件同理**：`user.create.test.ts`、`user.auth.test.ts`、`user.validation.test.ts`

### 文件 → 目录升级

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

## 目录结构

保持扁平。嵌套层级不超过 2-3 层。只有当文件多到在单个目录中难以浏览时才引入子目录，作为最后手段而非默认选择。

## 与 write 的配合

write 工具的重写模式与短文件策略相互强化（参见 write skill）：

- 大文件让 write 重写成本高 → 驱使你拆分
- 拆分后的小文件 → write 重写毫无负担
- 每次修改只涉及少数小文件 → 变更聚焦、风险可控
