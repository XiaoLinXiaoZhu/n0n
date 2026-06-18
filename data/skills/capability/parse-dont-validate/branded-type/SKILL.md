---
description: Branded type——用 opaque type + 智能构造器模拟解析约束。
activation: manual

---

有些约束难以完全在类型中表达（如整数的取值范围、字符串的格式），此时用 opaque type / branded type + 智能构造器。

```typescript
// branded type：运行时验证 + 类型级标记
type Port = number & { readonly __brand: "Port" };

const parsePort = (n: number): Port => {
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`invalid port: ${n}`);
  }
  return n as Port;
};
```
