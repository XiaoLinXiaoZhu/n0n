/**
 * Agent 自动继续提示 — 当 show(progress report) 触发时注入
 *
 * 独立于 REPL 主循环，便于调整措辞和多语言支持。
 * 与 format-idle-nudge.ts 保持相同的管理模式。
 */

/** progress report 状态时注入的系统提示 */
export const WORKING_NUDGE_TEXT =
	"系统收到了你的汇报，请你继续保持当前节奏完成工作。当前消息未发送给用户，若遇到问题时用 show(ask user question) 或 show(request user assistance) 主动寻求帮助。";
