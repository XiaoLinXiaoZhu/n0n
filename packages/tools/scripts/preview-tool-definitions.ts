/**
 * 工具定义预览生成器
 *
 * 生成每个工具的完整 ToolDefinition，展示提交给模型时的精确 JSON 结构。
 * 输出到 packages/tools/scripts/preview-output/，供人工校验。
 *
 * 运行: bun run packages/tools/scripts/preview-tool-definitions.ts
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { resolvePlatform } from "@n0n/shared";
import { showConfig } from "../../../apps/code/src/show-config.ts";
import { makeToolkit } from "../src";

const MODEL = "claude-sonnet-4-20250514";
const PREVIEW_DIR = join(import.meta.dir, "preview-output");
mkdirSync(PREVIEW_DIR, { recursive: true });

// 构建完整 toolkit（触发环境探测，与生产一致）
const toolkit = makeToolkit(
	showConfig,
	{
		workspace: process.cwd(),
		tempDir: join(process.cwd(), ".temp"),
		sessionDir: join(process.cwd(), ".temp", "preview-session"),
		platform: resolvePlatform(),
		security: { blocked_commands: [] },
		agent: { default_exec_waitfor: 120 },
	},
	MODEL,
);

let count = 0;
for (const def of toolkit.tools) {
	const lines = [
		`# Tool Definition: ${def.name}`,
		`<!-- generated for model: ${MODEL} -->`,
		"",
		"## parameters",
		"",
		"```json",
		JSON.stringify(def.parameters, null, 2),
		"```",
		"",
		"## description",
		"",
		"````",
		def.description,
		"````",
		"",
		"## Full OpenAI function format",
		"",
		"```json",
		JSON.stringify(
			{
				type: "function",
				function: {
					name: def.name,
					description: def.description,
					parameters: def.parameters,
				},
			},
			null,
			2,
		),
		"```",
		"",
	];

	const outPath = join(PREVIEW_DIR, `tool-${def.name}.preview.md`);
	await Bun.write(outPath, lines.join("\n"));
	count++;
	console.log(`  ${def.name} → ${outPath}`);
}

console.log(`\nGenerated ${count} tool previews in ${PREVIEW_DIR}/`);
