# Issue tracker: GitLab

本仓库的 issue 和 PRD 以 GitLab Issues 管理。使用 [`glab`](https://gitlab.com/gitlab-org/cli) CLI 操作。

## 约定

- **创建 issue**：`glab issue create --title "..." --description "..."`。多行用 heredoc。`--description -` 打开编辑器。
- **读取 issue**：`glab issue view <number> --comments`。`-F json` 输出机器可读格式。
- **列出 issue**：`glab issue list -F json`，配合 `--label` 过滤。
- **评论 issue**：`glab issue note <number> --message "..."`。GitLab 称评论为 "notes"。
- **应用/移除标签**：`glab issue update <number> --label "..."` / `--unlabel "..."`。多标签用逗号分隔或重复 flag。
- **关闭**：`glab issue close <number>`。先发关闭说明再关闭。
- **Merge Request**：GitLab 称 PR 为 "merge requests"。`glab mr create` / `glab mr view` / `glab mr note` 等。

从 `git remote -v` 推断仓库——`glab` 在克隆内部自动识别。

## dispatch skill 中的"发布到 issue tracker"

创建 GitLab issue。

## dispatch skill 中的"获取相关 issue"

运行 `glab issue view <number> --comments`。
