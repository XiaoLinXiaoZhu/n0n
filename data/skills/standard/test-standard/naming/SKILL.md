---
description: 测试命名——描述被测行为，格式为"场景 应该 结果"。
activation: init
order: 242
---

- 描述被测试的行为，而非实现细节
- 格式：`<什么场景> 应该 <什么结果>`
- 避免在用例名中出现"test"或"should"（重复信息）

| 不好 | 好 |
|------|-----|
| `test user login` | `无效 token 返回 401` |
| `should work correctly` | `空列表返回零总和` |
| `it doesn't crash` | `除数为零时抛出 DivideByZeroError` |
