/**
 * Code Agent show 结果 schema
 *
 * 一种继续记录 + 三种等待客户任务 + 四种质量终态。
 *
 * show 是模型唯一能被用户看到的信息出口。
 */

import { z } from "zod";
import { CODE_SHOW_TYPES } from "./show-types.ts";

export const CodeShowSchema = z.object({
	type: z.enum(CODE_SHOW_TYPES),
	content: z.string(),
});

export type CodeShowResult = z.infer<typeof CodeShowSchema>;
