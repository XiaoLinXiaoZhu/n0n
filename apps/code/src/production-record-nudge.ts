/**
 * Agent 自动继续提示 — 当 show(production record) 触发时注入
 *
 * 独立于 REPL 主循环，便于调整措辞和多语言支持。
 * 与 format-idle-nudge.ts 保持相同的管理模式。
 */

/** production record 状态时注入的系统提示 */
export const PRODUCTION_RECORD_NUDGE_TEXT =
	"生产记录已经向用户渲染并持久化；它不提醒用户，也不要求用户立即响应。请继续当前生产周期。需要客户提供信息、作出决定或执行操作时使用对应的等待类型；结束时使用与实际质量终态一致的类型。";
