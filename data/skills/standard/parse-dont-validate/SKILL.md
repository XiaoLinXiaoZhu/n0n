---
description: "Parse, Don't Validate —— 用精确类型消除非法状态，让类型系统替你保证正确性。"
activation: init
order: 210
---

# Parse, Don't Validate

## 核心原则

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

## 为什么重要

1. **消除冗余检查**：已验证的数据到下游仍需再次检查，解析过的数据则不用。
2. **防止漏改**：上游校验逻辑变了（比如"非空列表"改成允许空列表），验证模式不会触发编译错误；解析模式下类型变了，所有下游代码自动报错。
3. **让非法状态不可表达**：`NonEmpty<T>` 比 `T[]` 更精确；`Map<K,V>` 比 `[K,V][]` 更能杜绝重复键。

## 实践方法

### 在系统边界尽早解析

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

```typescript
// 好：入口处解析，内部直接用
import { z } from "zod";

const Config = z.object({
  port: z.coerce.number().int().min(1).max(65535),
});

type Config = z.infer<typeof Config>;

const config = Config.parse(process.env); // 启动时一次性解析
// 后续代码直接用 config.port，类型保证合法
```

### 用枚举代替布尔标志

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

### 对返回 void 的校验函数保持怀疑

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

### 让类型推动代码设计

先设计你希望拥有的理想数据类型，再写函数。不要用现有数据的形状反过来限制函数签名。

```typescript
// 不要想"我有 string[]，怎么写非空逻辑"
// 先想"我想要 NonEmptyArray 类型，再让输入适配它"

type NonEmptyArray<T> = [T, ...T[]];

const head = <T>(xs: NonEmptyArray<T>): T => xs[0];
// 类型签名本身就是保证：head 永远不会收到空数组
```

### 多用抽象类型模拟解析

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

## 各语言的常用工具

| 语言 | 推荐工具 |
|------|---------|
| TypeScript | `zod`, `io-ts`, `arktype` |
| Python | `pydantic`, `attrs`, `dataclasses` + `__post_init__` |
| Rust | `serde` + newtype pattern, `thiserror` |
| Go | 手写 parse 函数 + unexported fields |
| Haskell | `refined`, smart constructors, `Data.Set`/`Data.Map` |
| Java/Kotlin | sealed classes, value classes, factory methods |

核心模式在所有语言中都一样：在边界处将不精确的输入转换为精确的内部类型，让类型系统在后续流程中替你保证正确性。

## 不追求完美

并非所有约束都值得或都能编码到类型系统中。对于残留的运行时检查：

- 用 `// invariant:` 注释标记隐藏的约束
- 把不安全的代码集中在尽量小的模块内
- 当成"放射性物质"对待——隔离、标记、审慎处理

这个原则是追求的理想方向，不是必须达标的硬性要求。
