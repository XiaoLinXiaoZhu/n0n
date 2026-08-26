/**
 * Code Agent 的模型适配提示。
 *
 * 这些内容只调整特定模型的内部生成偏好，不属于 Self-Function 质量标准，
 * 也不构成用户可见的验收条件。
 */

const DEEPSEEK_ANALYSIS_PREFERENCE =
	"Model adapter preference: in hidden analysis, prefer to begin with `We need to` and reason in English. Do not expose hidden analysis or treat this format as a quality criterion.";

export function getCodeModelGuidance(modelId: string): string | null {
	return modelId.toLowerCase().includes("deepseek")
		? DEEPSEEK_ANALYSIS_PREFERENCE
		: null;
}

export function buildCodeSystemPrompt(
	basePrompt: string,
	modelId: string,
	prefix?: string,
): string {
	return [prefix, basePrompt, getCodeModelGuidance(modelId)]
		.filter((part): part is string => Boolean(part))
		.join("\n\n");
}
