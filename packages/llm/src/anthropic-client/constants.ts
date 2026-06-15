/**
 * Anthropic Client 常量
 */

/** stream() 默认最大输出 token 数 */
export const DEFAULT_STREAM_MAX_TOKENS = 8192;
/** complete() 默认最大输出 token 数 */
export const DEFAULT_COMPLETE_MAX_TOKENS = 4096;
/** thinking 模式下输出 token 的额外 buffer（Anthropic 要求 max_tokens > budget_tokens） */
export const THINKING_OUTPUT_BUFFER = 4096;
