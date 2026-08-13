# Tool Definition: write
<!-- generated for model: claude-sonnet-4-20250514 -->

## parameters

```json
{
  "type": "object",
  "properties": {
    "path": {
      "type": "string",
      "description": "File path relative to project root"
    },
    "content": {
      "type": "string",
      "description": "Complete file content to write"
    }
  },
  "required": [
    "path",
    "content"
  ],
  "additionalProperties": false
}
```

## description

````
Create or overwrite a file with the given content. Directories are created automatically.

Writes are deterministic — you need not wait for the result before issuing further calls in the same response. Writes to different paths may run in parallel; writes to the same path are serialized.
````

## Full OpenAI function format

```json
{
  "type": "function",
  "function": {
    "name": "write",
    "description": "Create or overwrite a file with the given content. Directories are created automatically.\n\nWrites are deterministic — you need not wait for the result before issuing further calls in the same response. Writes to different paths may run in parallel; writes to the same path are serialized.",
    "parameters": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "File path relative to project root"
        },
        "content": {
          "type": "string",
          "description": "Complete file content to write"
        }
      },
      "required": [
        "path",
        "content"
      ],
      "additionalProperties": false
    }
  }
}
```
