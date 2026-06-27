/**
 * Code Agent show 结果 schema
 *
 * 四种 type：
 * - progress report：阶段性进展，继续工作
 * - ask user question：向用户提问，等待选择
 * - request user assistance：需要用户介入操作
 * - final report：任务完成，最终汇报
 *
 * show 是模型唯一能被用户看到的信息出口。
 * 所有字段描述均假定用户已失去上下文——内容必须完整且自包含。
 */

import { z } from "zod";

export const CodeShowSchema = z.object({
	type: z.enum([
		"progress report",
		"ask user question",
		"request user assistance",
		"final report",
	]),
	content: z.string(),
});

export type CodeShowResult = z.infer<typeof CodeShowSchema>;
