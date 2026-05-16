# Issue tracker: GitHub

本仓库的 issue 和 PRD 以 GitHub Issues 管理。使用 `gh` CLI 操作。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行 body 用 heredoc。
- **读取 issue**：`gh issue view <number> --comments`，用 `jq` 过滤评论。
- **列出 issue**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合 `--label` 和 `--state` 过滤。
- **评论 issue**：`gh issue comment <number> --body "..."`
- **应用/移除标签**：`gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <number> --comment "..."`

从 `git remote -v` 推断仓库——`gh` 在克隆内部自动识别。

## dispatch skill 中的"发布到 issue tracker"

创建 GitHub issue。

## dispatch skill 中的"获取相关 issue"

运行 `gh issue view <number> --comments`。
