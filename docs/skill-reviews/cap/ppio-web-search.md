# ppio-web-search

> 来源：user skill | 激活：auto

## A. 类型组成

**Capability**（纯粹）。通过 PPIO API 搜索网页的能力，附带可执行脚本。

## B. 作用与核心思想

赋予模型搜索互联网的能力。

两种使用方式：
1. **库导入**（推荐）——在 workflow .ts 文件中直接 import 函数
2. **CLI 调用**——通过 act 执行搜索脚本

提供三个便利函数：`webSearch`（完整搜索）、`searchWeb`（网页搜索）、`searchWithSummary`（带摘要搜索）。支持时间范围、域名过滤、结果数量等参数。

核心思想：**让模型能够获取训练数据截止日期之后的信息**。

## C. 与执行工具和 progress 的结合潜力

**与 observe/act 直接结合**。搜索操作通过 observe（获取信息）或 act（执行脚本）执行。scripts/ 目录提供了可直接执行的脚本。

与 progress 没有直接关系——web search 是原子操作，不需要步骤追踪。但在 research skill 的上下文中，搜索结果可以作为证据链条的一部分出现在 progress(working) 中。

## 人类评价

这个属于拓展能力。

## AI 回应

分类确认：**Capability**。扩展模型的信息获取能力到互联网。