# annotation

> 来源：user skill | 激活：manual

## A. 类型组成

**Capability**（主要）+ **Knowledge**（次要）。教模型通过 jq 命令操作批注元数据文件，同时提供 JSON Schema 参考。

## B. 作用与核心思想

让模型能够读写 Markdown 文件的结构化批注（annotations）。

提供了完整的操作手册：
1. **文件结构**——`.annotations.json`（人类批注）和 `.ai-annotations.json`（AI 批注）的伴生关系
2. **JSON Schema**——批注的数据结构（锚点、内容、线程、标签）
3. **jq 操作模板**——读取、写入、回复、标记已解决的具体命令

核心思想：**通过 CLI 工具让模型参与人类的文档批注工作流**。模型不需要 UI，通过 jq 命令就能完成批注的全部 CRUD 操作。

## C. 与执行工具和 progress 的结合潜力

**与 observe/act 直接结合**。所有 jq 读取操作通过 observe 执行，所有写入操作通过 act 执行。

与 progress 没有直接关系——annotation 是能力扩展，不定义工作流程。

潜在结合：如果在代码 review 或文档审阅场景中使用，可以与 methodology skill 配合——比如 review skill 的产出通过 annotation 写入批注文件。

## 人类评价

这个还不稳定，我还在积极迭代。

## AI 回应

分类确认：**Capability**。持续迭代中，暂不做进一步评估。
