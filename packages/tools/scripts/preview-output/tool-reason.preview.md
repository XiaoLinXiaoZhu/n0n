# Tool Definition: reason
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
      "description": "Max seconds to wait for process (default: 60, max: 120). Process continues in background if exceeded.",
      "type": "number",
      "maximum": 240
    },
    "output_tokens": {
      "description": "Maximum estimated stdout+stderr tokens returned to the model (default: 5000, max: 32000). Full truncated output is saved as an execution artifact.",
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
Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "reason",
    "description": "Structured thinking, data processing, or hypothesis verification. No side effects — output is for the model's own consumption, not presented to the user.",
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
          "description": "Max seconds to wait for process (default: 60, max: 120). Process continues in background if exceeded.",
          "type": "number",
          "maximum": 240
        },
        "output_tokens": {
          "description": "Maximum estimated stdout+stderr tokens returned to the model (default: 5000, max: 32000). Full truncated output is saved as an execution artifact.",
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
