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
./src/exec/executor.ts
./src/exec/security.ts
./src/types/domain.ts
</output>
<output_info>
Estimated output 8200 tokens / requested 5000; 850 lines. Full output saved as execution artifacts:
stdout: .temp/session-0001/exec/runs/tc_3/stdout.txt
stderr: .temp/session-0001/exec/runs/tc_3/stderr.txt
</output_info>
<system-hint>
Do not blindly dump the artifact. Filter it, read explicit bounded ranges (independent ranges may be batched), or safely rerun a cheap read-only command with a sufficient output_tokens budget.
</system-hint>
```
