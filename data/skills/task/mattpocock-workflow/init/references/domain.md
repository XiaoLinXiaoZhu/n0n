# 领域文档消费规则

本 skill 体系中的其他 skill 在探索代码库时如何消费本仓库的领域文档。

## 探索前先读取

- **`CONTEXT.md`**（仓库根目录），或
- **`CONTEXT-MAP.md`**（仓库根目录，如果存在）——指向每个上下文的 `CONTEXT.md`。读取与当前主题相关的每个上下文。
- **`docs/adr/`**——读取涉及你要工作区域的 ADR。多上下文仓库中，也检查 `src/<context>/docs/adr/` 下的上下文级决策。

如果这些文件不存在，**静默继续**。不标记缺失，不建议立即创建。`plan` skill 在术语或决策真正需要解决时才按需创建。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（存在 `CONTEXT-MAP.md` 于根目录）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用词汇表的术语

当你的输出命名一个领域概念（issue 标题、重构提案、假设、测试名）时，使用 `CONTEXT.md` 中定义的术语。不要漂移到同义词。

如果需要的概念不在词汇表中，那是一个信号——要么你在发明项目不用的语言（重新考虑），要么真的存在缺口（记下来让 `plan` 处理）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 矛盾，显式指出来而不是静默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾——但值得重新考虑因为……_
