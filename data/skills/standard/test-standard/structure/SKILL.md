---
description: 测试结构——Arrange-Act-Assert 三段式。
activation: init
order: 241
---

# 测试结构

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
