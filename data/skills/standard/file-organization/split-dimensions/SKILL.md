---
description: 拆分维度——按功能/职责/类型变体划分文件。
activation: init
order: 113
---

按自然边界划分，选择最清晰的维度：

- **按功能/领域**：`auth.ts`、`profile.ts`、`billing.ts`
- **按职责**：`service.ts`、`repository.ts`、`dto.ts`
- **按类型变体**：对 union/sum type 的每个分支可各一个文件
- **测试文件同理**：`user.create.test.ts`、`user.auth.test.ts`、`user.validation.test.ts`
