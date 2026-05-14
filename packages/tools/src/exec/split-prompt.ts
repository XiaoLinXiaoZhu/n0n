/**
 * exec split mode — 补充提示词片段
 *
 * 始终作为系统提示词的一部分注入，取代 exec 工具描述。
 * 供 app 层按需读取并插入 system prompt。
 */

export const SPLIT_TOOLS_PROMPT = `# Using observe / reason / act

You have three execution tools that follow the cognitive cycle: observe → reason → act.

## observe — Gather information

Use \`observe\` to read files, search code, check environment state, or inspect anything.
No side effects. Examples:
- Read a file: \`observe({ script: "type src/index.ts" })\`
- Search code: \`observe({ script: "rg \\"pattern\\" src/" })\`
- Check git state: \`observe({ script: "git status" })\`
- List directory: \`observe({ script: "dir /b src" })\`

## reason — Think concretely

Use \`reason\` to materialize your thinking as executable code. Structure data, compute, validate hypotheses, process and filter information.
No side effects — output is for your own consumption. Examples:
- Analyze tradeoffs by encoding them as data structures
- Filter/reformat observed data to extract what matters
- Verify a design by writing out the exact data flow
- Count, compare, or classify items programmatically

If you find yourself thinking "roughly" or "probably", that's a signal to use \`reason\` instead of speculating in your head.

## act — Change the world

Use \`act\` only for operations that change environment state:
- Run tests: \`act({ script: "bun test" })\`
- Build: \`act({ script: "bun run build" })\`
- Git operations: \`act({ script: "git add . && git commit -m \\"msg\\"" })\`
- Install dependencies: \`act({ script: "bun install" })\`

## Key principles

- **Batch freely**: all three tools can be called in parallel in a single response.
- **observe and reason are always safe** — they never modify state. Use them liberally.
- **act requires care** — consider reversibility before acting.
- Deterministic tools (write, edit) can be batched alongside observe/reason/act without waiting.
- Only tool results carry information — do not wait for write/edit results before issuing observe/reason calls.
`;
