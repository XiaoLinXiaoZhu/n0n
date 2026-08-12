# user_input 消息（含 context + hint）
<!-- model: deepseek, tag-style: deepseek -->

```
role: user

--- content ---
<context>
<git_branch>main</git_branch>
<git_status>M src/auth.ts</git_status>
</context>

<user-request>
Fix the bug in auth module
</user-request>

<system-hint>
Start by reading src/auth.ts
</system-hint>
```
