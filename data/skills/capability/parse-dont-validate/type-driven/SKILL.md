---
description: 让类型推动代码设计——先设计理想类型，再写函数。
activation: manual

---

先设计你希望拥有的理想数据类型，再写函数。不要用现有数据的形状反过来限制函数签名。

```typescript
// 不要想"我有 string[]，怎么写非空逻辑"
// 先想"我想要 NonEmptyArray 类型，再让输入适配它"

type NonEmptyArray<T> = [T, ...T[]];

const head = <T>(xs: NonEmptyArray<T>): T => xs[0];
// 类型签名本身就是保证：head 永远不会收到空数组
```
