---
description: 注释标记表——TODO/FIXME/HACK/XXX/NOTE/invariant 的含义与示例。
activation: init
order: 221
---

# 注释标记

| 标记 | 用途 | 示例 |
|------|------|------|
| `TODO` | 临时方案，需后续修正 | `// TODO: 硬编码超时，应从配置读取` |
| `FIXME` | 已知缺陷，需修复 | `// FIXME: 并发调用时会竞态` |
| `HACK` | 绕过上游 bug 的权宜之计 | `// HACK: 绕过 libfoo v2.1 的 OOM bug，升级后移除` |
| `XXX` | 可疑代码，待确认是否需要 | `// XXX: 不确定这个 null 检查是否还需要` |
| `NOTE` | 非显而易见的设计意图 | `// NOTE: 保持两处排序一致以支持二分查找` |
| `invariant` | 类型系统无法表达的约束 | `// invariant: items 始终按 createdAt 升序排列` |
