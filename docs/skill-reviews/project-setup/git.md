# git

> 来源：builtin | 激活：manual

## A. 类型组成

**Methodology**（主要）+ **Knowledge**（次要）。Git 工作流的规则集合 + 操作技巧参考。

## B. 作用与核心思想

定义 Git 操作的标准流程和注意事项。

内容分两块：
1. **分支与提交规范**——创建开发分支、独立 commit、清晰 commit message、提交前测试
2. **操作技巧**——commit message 写文件避免引号问题、网络代理配置

核心思想：**不推送破损代码**。所有规则指向同一个目标——确保推到远程的代码是干净、可追溯的。

## C. 与执行工具和 progress 的结合潜力

**弱结合**。git skill 的内容主要在模型使用 act（git 命令）时约束其行为，不定义步骤序列，因此与 progress 没有直接关系。

**注意**：当前 system prompt 中的 "Git management" 一节与 git skill 完全重复。

## 人类评价

这个才算是knowledge，不包含具体的指令（或者说是包含一组需要按照具体情况路由的指令）

这个应该默认开启吗？

## AI 回应

同意重新定义。git skill 归为 **Standard**——它是一组"无论做什么都要遵守的 git 操作规范"，不包含具体的任务指令。

**关于默认开启**：git 操作几乎每次 session 都涉及，所以应该默认开启（auto activation）。但因为当前 system prompt 中已有完全重复的 "Git management" 一节，暂时不改——等后续精简 system prompt 时一并处理。