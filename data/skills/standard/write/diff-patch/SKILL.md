---
description: Diff/Patch 降级方案——遗留代码用 unified diff + git apply。
activation: init
order: 125
---

当且仅当文件不值得重构（遗留代码、不属于你的代码库）时，使用 unified diff：

```
write(.temp/fix.patch, <unified diff 内容>)
act(git apply .temp/fix.patch)
```

单个 diff 文件可以原子性地完成多文件操作：修改、创建、删除、重命名。

diff 有行号 + 上下文两重定位，不会错误匹配；`git apply` 在无法确认匹配时会失败而非猜测。
