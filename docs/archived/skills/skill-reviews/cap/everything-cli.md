# everything-cli

> 来源：user skill | 激活：manual

## A. 类型组成

**Knowledge**（纯粹）。Everything CLI (es.exe) 的参数速查手册。

## B. 作用与核心思想

提供 Everything CLI 的完整用法参考：搜索选项、结果控制、显示格式、高级搜索语法、常用示例。

核心思想：**让模型知道 es.exe 的能力边界和正确用法**。没有这个 skill，模型可能会用错误的参数或不知道某些高级功能。

## C. 与执行工具和 progress 的结合潜力

**弱结合**。纯参考信息，模型在 observe/act 中调用 es.exe 时查阅。与 progress 无关。

值得注意的是，everything-cli 是 disk-cleanup 的依赖——disk-cleanup 的第一步就是"用 Everything CLI 定位目标文件"。两者组合使用。

## 人类评价

这个属于拓展能力。

## AI 回应

分类确认：**Capability**。虽然内容是纯参考信息，但它服务于 es.exe 这个文件搜索能力——没有这个 skill 模型就不知道怎么用 es.exe。参考信息依附于能力本身。