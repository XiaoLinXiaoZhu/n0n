---
description: 各语言测试工具——TypeScript/Python/Rust/Go/Java 测试框架与断言风格。
activation: init
order: 249
---

# 各语言常用测试工具

| 语言 | 测试框架 | 断言风格 |
|------|---------|---------|
| TypeScript/JavaScript | `vitest`, `bun test` | `expect(x).toEqual(y)` |
| Python | `pytest` | `assert x == y` |
| Rust | `cargo test` (内置) | `assert_eq!(x, y)` |
| Go | `testing` (内置) | 表驱动测试 |
| Java/Kotlin | `JUnit 5`, `kotest` | `assertEquals(expected, actual)` |
