# exec tool_result — status: backgrounded（等待超限转后台）
<!-- model: deepseek, tag-style: deepseek -->

```
role: tool
toolCallId: tc_4
toolName: exec

--- content ---
## exec_meta
(unknown) . | backgrounded | 30003ms
---
## waitfor_notice
Process exceeded waitfor limit, moved to background.
PID: 65432
Log file: .temp/exec_bg_65432.log
---
## output
npm warn deprecated inflight@1.0.6
added 142 packages in 28s
---
【system-hint】
Log file updates every few seconds; read it to check progress.
---
```
