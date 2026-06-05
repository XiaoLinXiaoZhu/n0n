/**
 * ExecRole — observe / reason / act 的工具角色
 *
 * 三个工具共享 execToolStream 执行后端，通过 role 区分：
 * - observe: 只读观测，无副作用
 * - reason: 结构化思考，输出仅供模型消费
 * - act: 变更操作，可能不可逆
 *
 * role 是这三个工具的一等概念——它驱动工具定义、执行调用和格式化。
 */

export type ExecRole = "observe" | "reason" | "act";

/** ExecRole 数组——用于迭代和穷尽检查 */
export const EXEC_ROLES: readonly ExecRole[] = [
	"observe",
	"reason",
	"act",
] as const;
