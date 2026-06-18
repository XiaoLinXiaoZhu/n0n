---
description: Git commit 技巧——先写文件再 commit，避免 shell 引号问题。
activation: init
order: 312
---

创建 commit 和 PR 时，先将变更描述写入文件，再从文件创建 commit/PR——避免 bash/cmd 中的引号问题。示例如下：

```yaml
# 使用 write 工具将 commit message 写入临时文件
write:
  path: .temp/commit-msg.txt
  content: |
    feat: 添加用户登录功能

    - 实现 JWT 令牌签发与验证
    - 新增 /api/login 和 /api/register 接口
    - 添加密码加密工具类

# 使用 act 工具执行 git commit，从文件读取 message
act:
  script: git commit -F .temp/commit-msg.txt
```
