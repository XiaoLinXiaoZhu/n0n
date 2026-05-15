# Topic: Git 工作流

## 讨论来源

- git (builtin) — Git 工作流规范

## 定位

git skill 是 Standard 类型——一组"无论做什么都要遵守的 git 操作规范"，不包含具体任务指令。

内容：分支与提交规范 + 操作技巧（commit message 写文件避免引号、网络代理）。

核心思想：**不推送破损代码**。

### 讨论

**人类**：这个才算是 knowledge，不包含具体的指令。这个应该默认开启吗？

**AI**：应该默认开启（auto activation）。但当前 system prompt 中已有完全重复的 "Git management" 一节，等后续精简 system prompt 时一并处理。

## 待决事项

- [init-skill，因为大部分项目都拥有git，而且模型也确实经常会无脑提交等。] 精简 system prompt 时，将 "Git management" 节移出，由 git skill (auto) 替代
