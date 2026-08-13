# Tool Definition: observe
<!-- generated for model: claude-sonnet-4-20250514 -->

## parameters

```json
{
  "type": "object",
  "properties": {
    "runtime": {
      "description": "Runtime (default: \"sh\"). Options: sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv.",
      "type": "string"
    },
    "cwd": {
      "description": "Working directory (default: injected workspace root)",
      "type": "string"
    },
    "waitfor": {
      "description": "Max seconds to wait for the process (default: 20, max: 240). Exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. Set this explicitly when you expect the command to take longer.",
      "type": "number",
      "maximum": 240
    },
    "output_tokens": {
      "description": "Maximum estimated stdout+stderr tokens returned to the model (default: 5000, max: 32000). The budget covers both streams combined. Full output is saved as an execution artifact when truncated.",
      "type": "integer",
      "exclusiveMinimum": 0,
      "maximum": 32000
    },
    "script": {
      "type": "string",
      "description": "Script content. Single command or multi-line code with imports, loops, etc."
    }
  },
  "required": [
    "script"
  ],
  "additionalProperties": false
}
```

## description

````
Read files, search code, or inspect environment state. No side effects — this tool only gathers information.

Calls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "observe",
    "description": "Read files, search code, or inspect environment state. No side effects — this tool only gathers information.\n\nCalls run in submission order, so a call that depends on an earlier one can still be issued in the same response. Split into a separate response only when you must see a result before deciding what to do next.",
    "parameters": {
      "type": "object",
      "properties": {
        "runtime": {
          "description": "Runtime (default: \"sh\"). Options: sh, bash, pwsh, cmd, bun, node, deno, python, python3, uv.",
          "type": "string"
        },
        "cwd": {
          "description": "Working directory (default: injected workspace root)",
          "type": "string"
        },
        "waitfor": {
          "description": "Max seconds to wait for the process (default: 20, max: 240). Exceeding it is a signal, not a failure: the process keeps running in the background and its PID and execution artifact are returned. Set this explicitly when you expect the command to take longer.",
          "type": "number",
          "maximum": 240
        },
        "output_tokens": {
          "description": "Maximum estimated stdout+stderr tokens returned to the model (default: 5000, max: 32000). The budget covers both streams combined. Full output is saved as an execution artifact when truncated.",
          "type": "integer",
          "exclusiveMinimum": 0,
          "maximum": 32000
        },
        "script": {
          "type": "string",
          "description": "Script content. Single command or multi-line code with imports, loops, etc."
        }
      },
      "required": [
        "script"
      ],
      "additionalProperties": false
    }
  }
}
```
