/**
 * @n0n/skill — 编程 API 入口
 *
 * CLI 入口为 cli.ts，此文件为 library 消费者提供编程接口。
 */

export type { Skill, SkillContent, SkillMeta } from "./api.ts";
export {
	listSkills,
	loadInitSkills,
	readSkill,
	readSkills,
	toSkill,
} from "./api.ts";
export {
	getBuiltinSkillsDir,
	getSkillDirs,
	getUserSkillsDir,
} from "./paths.ts";
