---
description: 当用户要求记录、归档、整理文档，且内容涉及知识、操作记录、状态快照或备份时使用。将内容归档到用户指定路径；未指定时归档到当前工作区 docs/ 下。组织方式：静态知识用 md、变更集用 jsonl（仅末尾追加）、状态快照用 json（与静态知识分离，非必要不落盘而提供读取命令示例）、备份放 backup/ 目录。
activation: manual
alias: record
---

# record：记录与归档

## 触发场景

- 用户要求将知识、操作记录、变更历史、状态或备份归档成文档。
- 触发关键词：记录、归档、写文档、整理记录、changelog、快照、备份。

## 目标路径确定

1. 用户指定路径 → 使用指定路径，不套用默认规则。
2. 未指定 → 归档到当前工作区 `<workspace>/docs/`；不存在则 act 执行 `mkdir -p` 创建。

## 组织方式

| 内容类型 | 格式 | 规则 |
| --- | --- | --- |
| 静态知识（长期有效、不常变） | md | 一个文件或按主题拆分的多个文件。只写知识本身，禁止混入当前状态/时效性描述 |
| 变更集（操作记录） | jsonl | 每行一个 JSON 对象，仅末尾追加。禁止覆盖、重排、修改已有行；历史变更用新行记录 |
| 当前状态/快照 | json | 单独文件，禁止写入 md（与静态知识耦合会导致修改互相牵动）。若状态可从源数据现场读取，默认不落盘，改为提供脚本或命令行示例，需要时读取 |
| 备份 | 原格式 | 复制到归档目录 `backup/` 下，文件名带时间戳避免覆盖。变更集记录中指向备份文件路径 |

判定"当前状态与静态知识耦合"的信号：md 中出现"当前/截至/最新/现状"等时效性表述。

## 流程

1. **确认内容与路径**：列出本次归档的内容类型（知识/变更/快照/备份），按上文规则确定路径。
2. **建目录**：act 执行 `mkdir -p <path>`；需要备份时建 `<path>/backup/`。
3. **写静态知识**：observe 收集事实 → write md 文件。
4. **追加变更集**：追加方式写 jsonl（见命令示例），禁止整体重写文件。
5. **执行备份**：act 复制源文件到 `backup/`（cp 保留源文件；用 mv 则记一条 backup.move 事件）。
6. **快照**：仅当有特别必要（源数据不可读、需固化历史时刻）时 write `<path>/state.json`；否则在 md 中提供读取命令示例。
7. **验证**：读回检查——md 存在；jsonl 每行可被 json.loads 解析；json 快照可解析。
8. **交付**：show(final report)，自包含说明归档路径、文件清单、验证结果、关键决策。

## 命令示例

### 追加变更集（python，自动处理 JSON 转义，推荐）

```sh
python3 - <<'EOF'
import json
entry = {"ts": "<ISO8601 时间>", "event": "<事件类型>", "target": "<目标>", "result": "ok", "note": "<原因说明>"}
with open("<path>/changelog.jsonl", "a", encoding="utf-8") as f:
    f.write(json.dumps(entry, ensure_ascii=False) + "\n")
EOF
```

### 追加变更集（bash，内容简单时）

```sh
cat >> <path>/changelog.jsonl <<'EOF'
{"ts":"...","event":"...","target":"...","result":"ok","note":"..."}
EOF
```

### 读取当前状态（不落盘快照时，按源格式给出示例）

```sh
# 示例：读取 YAML 文件的 prepend 规则段
sed -n '/^prepend:/,/^append:/p' <源文件>
```

### 验证 jsonl

```sh
python3 -c "
import json
with open('<path>/changelog.jsonl') as f:
    lines = [l for l in f if l.strip()]
for i, l in enumerate(lines, 1):
    json.loads(l)
print(f'{len(lines)} lines, all valid')"
```

## 约束

- jsonl 只追加：历史记录不可修改，后续变更用新行记录。
- 快照与静态知识分离：md 中出现时效性状态描述即视为耦合，必须拆出。
- 备份不改动源文件；文件名带时间戳。
- 交付时引用文件路径，格式 `path/to/file` 或绝对路径。
