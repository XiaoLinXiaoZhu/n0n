---
description: 测试规范。命名、结构、文件组织、工具复用、覆盖策略、各语言工具参考。
activation: init
order: 240
---

# 测试规范

## 核心约束

- **禁止修改或删除已有测试来"修复"失败**——测试失败说明代码有问题，不是测试有问题
- **禁止纯 `assertNotNull` 式浅层断言**——每个断言必须验证具体值或状态变化
- **不要创建无效的测试**——测试必须能真正检测到错误，而非只是走过场

## 测试结构

遵循 Arrange-Act-Assert（准备-执行-断言）三段式：

```typescript
test("空购物车应用优惠券返回'购物车为空'", () => {
  // Arrange：准备数据
  const cart: Cart = { items: [] };
  const coupon: Coupon = { code: "SAVE10", discount: 0.1 };

  // Act：执行操作
  const result = applyCoupon(cart, coupon);

  // Assert：验证结果
  expect(result).toEqual({ ok: false, error: "购物车为空" });
});
```

## 测试命名

- 描述被测试的行为，而非实现细节
- 格式：`<什么场景> 应该 <什么结果>`
- 避免在用例名中出现"test"或"should"（重复信息）

| 不好 | 好 |
|------|-----|
| `test user login` | `无效 token 返回 401` |
| `should work correctly` | `空列表返回零总和` |
| `it doesn't crash` | `除数为零时抛出 DivideByZeroError` |

## 测试属性

- **小而原子化**：每个测试只验证一个行为，失败时一眼定位问题
- **彼此独立隔离**：测试之间不共享可变状态，执行顺序不影响结果
- **只测公共接口**：测试通过公开 API 验证行为，不测私有实现细节
- **谨慎使用 Mock**：优先使用真实对象（或轻量 fake），仅对不可控的外部依赖（网络、时钟、文件系统）使用 mock

## 文件组织

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

## 测试工具函数

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

export const mockUserRepo = (): UserRepository => ({
  findById: async (id: string) => createTestUser({ id }),
  save: async () => {},
});
```

适用范围：
- 测试数据工厂函数（带可选的 overrides 参数）
- Mock / Stub 对象构造
- 测试环境初始化 / 清理
- 重复出现的断言组合

这些是简单的工具函数，不算过早抽象——它们消除的是测试代码本身的重复，而非业务逻辑的重复。如果工具函数本身变得复杂（含分支逻辑、条件判断），那才是过度设计的信号。

## 覆盖策略

不追求 100% 覆盖率。优先覆盖：

1. 核心业务逻辑（计算、状态转换、校验规则）
2. 边界条件（空输入、极限值、边界值）
3. 已知回归点（曾经出过 bug 的地方）
4. 安全敏感路径（权限、认证、数据完整性）

对于 CRUD/样板代码，除非有非平凡逻辑，否则不必为测而测。

## 各语言常用工具

| 语言 | 测试框架 | 断言风格 |
|------|---------|---------|
| TypeScript/JavaScript | `vitest`, `bun test` | `expect(x).toEqual(y)` |
| Python | `pytest` | `assert x == y` |
| Rust | `cargo test` (内置) | `assert_eq!(x, y)` |
| Go | `testing` (内置) | 表驱动测试 |
| Java/Kotlin | `JUnit 5`, `kotest` | `assertEquals(expected, actual)` |
