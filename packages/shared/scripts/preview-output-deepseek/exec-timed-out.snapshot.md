# exec tool_result — status: backgrounded（等待超限转后台）
<!-- model: deepseek, tag-style: deepseek -->

```
role: tool
toolCallId: tc_4
toolName: observe

--- content ---
<observe_meta>
(unknown) . | backgrounded | 30003ms
</observe_meta>
<waitfor_notice>
Process exceeded waitfor limit, moved to background.
PID: 65432
Execution artifact: .temp/session-0001/exec/runs/tc_4
</waitfor_notice>
<output>
npm warn deprecated inflight@1.0.6
added 142 packages in 28s
</output>
<system-hint>
Execution artifacts update while the process runs; inspect them for progress.
Decide now: does this process need to keep running? If not, kill it by PID. Do not leave background processes running without purpose.
</system-hint>
```
