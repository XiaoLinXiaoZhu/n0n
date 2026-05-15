# Topic: 编码实践与测试

## 讨论来源

- coding (builtin) — 编码标准
- tdd (mattpocock) — 测试驱动开发

## coding 标准

coding skill 定义了编码过程中的微观决策标准：改动标记、错误处理、抽象原则、注释哲学。

核心思想：**最小化行动**——不该加的不加，该加的加。

### 讨论

**人类**：其实我在想这个真的是需要手动激活的还是不论何时都需要激活的标准？

**AI**：coding 是"不论何时都需要的标准"（Standard 类型）。应设为 auto activation 或并入 system prompt。保持 skill 形式的好处是迭代更快。

## TDD 与 AI 时代的测试策略

mattpocock 的 tdd skill 强调严格的 Red-Green-Refactor 小步循环。但在 AI 场景下存在根本问题。

### 讨论

**人类**（引用外部批评）：

传统 TDD 的问题：
- AI 的试错成本不是时间，是上下文空间
- "写最少代码使测试通过"治的是人类过度工程化的病，AI 没有这个病
- AI 会偷偷修改/删除测试来"修复"失败

AI TDD 应该这样做：
```
传统 TDD:  Red → Run → Green → Run → Refactor → Run   (6步，3次运行)
AI TDD:    Spec → Test+Impl → Verify → Fix(if needed)  (2-3步，1-2次运行)
```

保留的原则：测试小而原子化、命名体现意图、只测公共接口、谨慎 Mock、测试独立隔离。

砍掉的：严格 Red-Green-Refactor 循环、"写最少代码使测试通过"。

新增：变异测试（Stryker）验证测试有效性。

硬规则建议写入 coding standard：
- 禁止修改或删除已有测试来"修复"失败
- 禁止纯 assertNotNull 式浅层断言
- 变异测试门禁 ≥ 60%

**AI**：完全同意。如果做 tdd task，采用 AI TDD 模式。变异测试作为质量门禁非常值得引入。

## 待决事项

- [是的] 是否将"禁止修改已有测试"写入 coding skill
- [感觉校验test是否为有效test可以作为一个task来用，然后这里就简单提一下不要创建无效的test] 是否引入 Stryker 变异测试作为 capability
- [作为init-skill管理] coding skill 是否并入 system prompt 还是保持 auto skill
