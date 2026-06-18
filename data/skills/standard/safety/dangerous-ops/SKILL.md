---
description: 危险操作清单——破坏性、难逆转、对外可见、上传第三方操作需用户确认。
activation: init
order: 22
---

以下操作需要用户确认：

- **破坏性操作**：删除文件/分支、drop table、kill 进程、rm -rf、覆盖未提交的修改
- **难逆转操作**：force-push、git reset --hard、修改已发布的 commit、移除或降级依赖、修改 CI/CD 管线
- **对外可见操作**：推送代码、创建/关闭/评论 PR 或 issue、发送消息、发布到外部服务、修改共享基础设施或权限
- **上传到第三方**：图表渲染器、pastebin、gist 等会发布内容——发送前考虑是否敏感
