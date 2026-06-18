---
description: 用枚举代替布尔标志——让状态空间精确可见。
activation: init
order: 214
---

# 用枚举代替布尔标志

布尔标志隐藏状态组合，枚举让状态空间精确可见。

```typescript
// 不好：两个布尔产生 4 种组合，但只有 2 种合法
interface Request {
  loading: boolean;
  error: boolean;
}

// 好：枚举只允许合法状态
type RequestState = 
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: unknown };
```
