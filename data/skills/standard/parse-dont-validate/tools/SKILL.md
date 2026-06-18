---
description: 各语言 Parse 工具推荐——TypeScript/Python/Rust/Go/Haskell/Java。
activation: init
order: 218
---

| 语言 | 推荐工具 |
|------|---------|
| TypeScript | `zod`, `io-ts`, `arktype` |
| Python | `pydantic`, `attrs`, `dataclasses` + `__post_init__` |
| Rust | `serde` + newtype pattern, `thiserror` |
| Go | 手写 parse 函数 + unexported fields |
| Haskell | `refined`, smart constructors, `Data.Set`/`Data.Map` |
| Java/Kotlin | sealed classes, value classes, factory methods |

核心模式在所有语言中都一样：在边界处将不精确的输入转换为精确的内部类型，让类型系统在后续流程中替你保证正确性。
