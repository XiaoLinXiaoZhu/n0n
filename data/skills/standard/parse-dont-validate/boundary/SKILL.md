---
description: 在系统边界尽早解析——数据一进入系统就转为目标类型。
activation: init
order: 212
---

数据一进入系统就解析为目标类型，不要让原始数据在内部传播。输入校验、API 响应、环境变量、配置文件——在入口处完成转换。

```typescript
// 不好：内部到处都得处理原始字符串
const getPort = (): number => {
  const p = parseInt(process.env.PORT ?? "3000");
  if (isNaN(p)) throw new Error("bad port");
  return p;
};
// 每个使用方都要各自校验，或者祈祷别人已经校验过了
```

核心模式：在边界处将不精确的输入转换为精确的内部类型，让类型系统在后续流程中替你保证正确性。
