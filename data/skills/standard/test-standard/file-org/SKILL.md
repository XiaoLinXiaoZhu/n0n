---
description: 测试文件组织——短小单一职责，按测试方向拆分独立文件。
activation: init
order: 244
---

测试文件遵循与源代码一致的 file-organization 原则：**短小、单一职责**。当一个模块有多个测试方向时，拆分为独立文件：

```
# 不好：所有测试堆在一个大文件
src/user/user.service.test.ts   # 2000 行，涵盖 CRUD + 权限 + 校验 + 通知

# 好：按测试方向拆分
src/user/user.service.create.test.ts
src/user/user.service.update.test.ts
src/user/user.service.delete.test.ts
src/user/user.service.auth.test.ts
src/user/user.service.validation.test.ts
```

拆分维度选择最自然的划分方式：按功能、按 API 端点、按状态路径均可。关键是每个文件打开后能一眼看到全部内容，无需滚动。
