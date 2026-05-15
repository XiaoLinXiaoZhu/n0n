# ssh-remote

> 来源：user skill | 激活：manual

## A. 类型组成

**Capability**（主要）+ **Knowledge**（次要）。通过 paramiko 操作远程 GPU 服务器的完整操作手册。

## B. 作用与核心思想

赋予模型通过 SSH 连接和控制远程 GPU 服务器（如 AutoDL）的能力。

六种操作模式：
1. 执行单条命令
2. 执行多条命令（含环境配置）
3. SFTP 上传文件
4. 启动后台训练
5. 检查训练进度
6. 下载训练结果

同时包含大量实践知识：费用控制（训练完成后必须关机）、连接问题处理、路径约定、stdout 阻塞陷阱、等待训练的正确模式。

核心思想：**让模型能够完成完整的远程训练生命周期**（连接 → 上传 → 训练 → 监控 → 下载 → 关机），而不仅仅是"能执行 SSH 命令"。

## C. 与执行工具和 progress 的结合潜力

**与 act 直接结合**。所有 SSH 操作通过 act 工具（runtime=uv, Python paramiko）执行。

与 progress 的结合潜力较高——远程训练是典型的长时间异步任务：
- progress(working)：上传进度、训练启动确认、训练进度检查
- progress(blocked)：需要用户提供连接信息时（skill 已显式要求）
- progress(completed)：训练完成、结果已下载、提醒关机

skill 中已包含"如果用户未提供端口和密码，必须用 progress(blocked) 要求提供"的约束，这是与 progress 结合的良好示例。

## 人类评价

这个属于拓展能力。

## AI 回应

分类确认：**Capability**。扩展模型的操作范围到远程服务器。