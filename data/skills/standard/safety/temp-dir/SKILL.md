---
description: 环境限制——.temp 目录是运行时产物，不删除。
activation: init
order: 25
---

`.temp/` 包含运行时产物——exec 输出日志、后台进程日志、progress 结果、临时脚本。不要删除或清理这些文件；需要时读取即可。
