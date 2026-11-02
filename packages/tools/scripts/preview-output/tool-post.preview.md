# Tool Definition: post
<!-- generated for model: claude-sonnet-4-20250514 -->

## parameters

```json
{
  "type": "object",
  "properties": {
    "uri": {
      "type": "string",
      "description": "The target address. Its scheme (exec / write / customer / todo) decides which backend runs and how body is interpreted — see the tool description for the uri template of each scheme."
    },
    "body": {
      "type": "string",
      "description": "The payload. Code for exec://, the file's complete new content for write:// — the body is the whole new state, not a diff or a fragment, the message text for customer://, the Markdown todo list for todo://."
    }
  },
  "required": [
    "uri",
    "body"
  ],
  "additionalProperties": false
}
```

## description

````
Four uri schemes route this tool to different backends:

exec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_tokens=… . Body is code (a single command or multi-line script with imports, loops, etc.). Runtime options: sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv (default: "cmd"). <NAME> is your own short label for what this step is doing (e.g. read-config). cwd is the working directory (default: injected workspace root). waitfor is max seconds to wait (default: 20, max: 240); exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. max_output_tokens caps the estimated stdout+stderr tokens returned to you (default: 5000, max: 32000); the budget covers both streams combined and full output is saved as an execution artifact when truncated.
write — write://<path> . Body is the file's complete new state: the file is created if missing, or replaced in full if it exists. Paths are resolved relative to the workspace unless absolute. write:// takes no query parameters; the body is file content only, never parameter text. write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.
customer — customer://question | customer://form | customer://action_required . Optionally append /<slug> after the kind (e.g. customer://question/choose-approach) to name this pause in the session output records; without a slug the kind is used. Body is the message to the customer. This interrupts the agent loop and waits for the customer to respond. question is a multiple-choice question with a recommended pick; form requests specific information; action_required is something the customer must do.
todo — todo://<goal> . Body is a Markdown todo list (nesting allowed); it is persisted to your session's todo store and replaces the previous list for <goal>. Use it to plan multi-step work and track progress across rounds.

Calls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "post",
    "description": "Four uri schemes route this tool to different backends:\n\nexec — exec://<runtime>/<NAME>?cwd=…&waitfor=…&max_output_tokens=… . Body is code (a single command or multi-line script with imports, loops, etc.). Runtime options: sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv (default: \"cmd\"). <NAME> is your own short label for what this step is doing (e.g. read-config). cwd is the working directory (default: injected workspace root). waitfor is max seconds to wait (default: 20, max: 240); exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. max_output_tokens caps the estimated stdout+stderr tokens returned to you (default: 5000, max: 32000); the budget covers both streams combined and full output is saved as an execution artifact when truncated.\nwrite — write://<path> . Body is the file's complete new state: the file is created if missing, or replaced in full if it exists. Paths are resolved relative to the workspace unless absolute. write:// takes no query parameters; the body is file content only, never parameter text. write:// cannot read files — to read one, use exec:// with a read script (e.g. cat or type); reading is an intentional action performed through code execution.\ncustomer — customer://question | customer://form | customer://action_required . Optionally append /<slug> after the kind (e.g. customer://question/choose-approach) to name this pause in the session output records; without a slug the kind is used. Body is the message to the customer. This interrupts the agent loop and waits for the customer to respond. question is a multiple-choice question with a recommended pick; form requests specific information; action_required is something the customer must do.\ntodo — todo://<goal> . Body is a Markdown todo list (nesting allowed); it is persisted to your session's todo store and replaces the previous list for <goal>. Use it to plan multi-step work and track progress across rounds.\n\nCalls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.",
    "parameters": {
      "type": "object",
      "properties": {
        "uri": {
          "type": "string",
          "description": "The target address. Its scheme (exec / write / customer / todo) decides which backend runs and how body is interpreted — see the tool description for the uri template of each scheme."
        },
        "body": {
          "type": "string",
          "description": "The payload. Code for exec://, the file's complete new content for write:// — the body is the whole new state, not a diff or a fragment, the message text for customer://, the Markdown todo list for todo://."
        }
      },
      "required": [
        "uri",
        "body"
      ],
      "additionalProperties": false
    }
  }
}
```
