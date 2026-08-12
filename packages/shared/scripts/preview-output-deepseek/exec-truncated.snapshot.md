# exec tool_result — status: truncated（输出超长截断）
<!-- model: deepseek, tag-style: deepseek -->

```
role: tool
toolCallId: tc_3
toolName: observe

--- content ---
<observe_meta>
(sh) . | exit 0 | 320ms | truncated to .temp/session-0001/exec/runs/tc_3
</observe_meta>
<output>
... (last 4 of 850 lines)
./src/exec/executor.ts
./src/exec/security.ts
./src/types/domain.ts
</output>
<output_info>
Full output (850 lines) saved as execution artifacts:
stdout: .temp/session-0001/exec/runs/tc_3/stdout.txt
stderr: .temp/session-0001/exec/runs/tc_3/stderr.txt
</output_info>
<system-hint>
Use targeted filtering or `n0n read`; avoid re-dumping the full artifact.
</system-hint>
```
