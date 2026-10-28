# exec tool_result — status: completed（命令失败）
<!-- model: deepseek, tag-style: deepseek -->

```
role: tool
toolCallId: tc_2
toolName: post

--- content ---
<exec_meta>
(sh) /Users/preview/projects/demo | exit 1 | 5ms
</exec_meta>
<stderr>
cat: missing.txt: No such file or directory
</stderr>
```
