# n0n CLI 结构

## 最终命令契约

- `n0n`：在当前目录启动交互模式。
- `n0n <existing-path>`：以现存目录或文件所在目录作为 workspace，支持拖拽路径。
- `n0n <unknown-or-nonexistent>`：报告未知命令或路径不存在，展示帮助并以状态码 1 退出。
- `n0n -p/--prompt <text>`：执行一次 prompt，完成后退出。
- `n0n scan global|project`：扫描全局或项目环境。
- `n0n skill ...`：管理 skills。
- `n0n config [global|local|all]`：打开配置文件。
- `n0n env [global|local|all]`：打开配置目录。

当前没有 `n0n agent` 和 `n0n init`。首次启动会自动创建所需的全局配置；`init` 保留给未来更明确的项目初始化语义。

## 包职责

- `apps/cli`（`@n0n/cli`）：唯一 bin，使用 Commander 注册命令、子命令和选项。
- `apps/code`（`@n0n/code`）：导出类型化 `runCode(options)`，不解析 argv，不调用 `process.exit()`。
- `apps/n0n-scan`（`@n0n/scan`）：导出 `scanGlobal()` 和 `scanProject()`。
- `apps/n0n-skill`（`@n0n/skill`）：导出类型化 skill 操作。

只有 `@n0n/cli` 发布 `n0n` bin；scan、skill 和 code 包不发布独立命令。

## 配置文件打开命令

打开命令使用 argv 数组，不解析 shell 字符串：

```toml
[settings.cli]
open_command = ["code"]
```

例如：

```toml
[settings.cli]
open_command = ["code", "--reuse-window"]
```

执行时，目标文件或目录会追加到该 argv 数组末尾。
