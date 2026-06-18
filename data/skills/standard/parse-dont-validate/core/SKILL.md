---
description: Parse vs Validate 概念——验证返回同类型，解析返回更精确类型。
activation: init
order: 210
---

# Parse, Don't Validate — 核心概念

**验证** (validate) 检查数据是否合法，然后返回同样的类型。**解析** (parse) 检查数据，然后返回一个更精确的类型——非法状态在该类型中无法表达。

```typescript
// 验证：返回值仍是 string，调用者不知道它是否已通过校验
const validateEmail = (s: string): boolean => /@/.test(s);

// 解析：返回 Email 类型，后续代码无需再怀疑
type Email = string & { readonly __brand: "Email" };
const parseEmail = (s: string): Email => {
  if (!/@/.test(s)) throw new Error("invalid email");
  return s as Email;
};
```

验证把负担推给调用者（"我检查过了，但你自己再确认一下"），解析把保证嵌入类型系统（"这个值已经是合法的，类型本身就是证明"）。
