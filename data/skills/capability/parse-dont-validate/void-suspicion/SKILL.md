---
description: 对返回 void 的校验函数保持怀疑——可改写为返回更精确类型的解析函数。
activation: manual

---

如果一个函数的唯一目的是检测错误、返回 void/unit，通常可以改写成返回更精确类型的解析函数。

```typescript
// 不好：调用者可能忘记调用
const ensureNoDuplicates = (entries: [string, unknown][]): void => {
  const seen = new Set();
  for (const [k] of entries) {
    if (seen.has(k)) throw new Error(`duplicate key: ${k}`);
    seen.add(k);
  }
};

// 好：返回 Map 类型，不可能有重复
const toMap = (entries: [string, unknown][]): Map<string, unknown> => {
  const m = new Map(entries);
  if (m.size !== entries.length) throw new Error("duplicate keys");
  return m;
};
```
