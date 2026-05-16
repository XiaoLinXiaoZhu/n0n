# Issue tracker: 本地 Markdown

本仓库的 issue 和 PRD 以 `.scratch/` 下的 markdown 文件管理。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- PRD 是 `.scratch/<feature-slug>/PRD.md`
- 实现 issue 是 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号
- Triage 状态记录在每个 issue 文件顶部的 `Status:` 行（参考 triage-labels.md 的角色字符串）
- 评论和对话历史追加到文件底部 `## Comments` 标题下

## dispatch skill 中的"发布到 issue tracker"

在 `.scratch/<feature-slug>/` 下创建新文件（目录不存在则创建）。

## dispatch skill 中的"获取相关 issue"

读取指定路径的文件。用户通常直接传路径或 issue 编号。
