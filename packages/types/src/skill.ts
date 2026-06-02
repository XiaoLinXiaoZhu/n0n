/**
 * Skill — 领域层最小 skill 接口
 *
 * 这是提示词组织（format-prompt）和领域消息（DomainMessage）层关心的最小 skill 表示，
 * 与文件系统发现层的丰富类型（@n0n/skills 的 SkillContent，含 uid/category/path/activation 等）
 * 解耦。消费方只需 skill 的名称、正文与附带资源即可完成提示词拼装。
 *
 * 设计原则：
 * - 最小字段：只保留拼装提示词所需的信息，不携带 discovery/调度元数据。
 * - 第一方支持：skill 是领域层一等概念，SystemWithSkillMessage / UserInputMessage 直接引用。
 */
export interface Skill {
	/** skill 名称（用于在提示词中标识，如 <skill name="..."> ） */
	name: string;
	/** SKILL.md 的 Markdown 正文（指令内容） */
	body: string;
	/** skill 目录下的脚本文件列表（相对路径），供模型感知可执行能力 */
	scripts: string[];
	/** skill 目录下的额外资源文件列表（路径），供模型感知可读取资源 */
	resources: string[];
}
