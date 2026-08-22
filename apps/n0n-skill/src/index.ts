/**
 * @n0n/skill — 编程 API 入口
 *
 * 由统一的 `n0n skill` 子命令调用，也为 library 消费者提供编程接口。
 */

export type { Skill, SkillContent, SkillMeta } from "./api.ts";
export {
	listSkills,
	loadInitSkills,
	loadInitSkillsFromDirs,
	readSkill,
	readSkills,
	toSkill,
} from "./api.ts";
export {
	createCommand as createSkill,
	parseSkillLocation,
	type SkillLocation,
} from "./commands/create.ts";
export { helpCommand as showSkillHelp } from "./commands/help.ts";
export { initCommand as initializeBuiltinSkills } from "./commands/init.ts";
export { installCommand as installSkill } from "./commands/install.ts";
export {
	type ListCommandOptions,
	listCommand as showSkillList,
} from "./commands/list.ts";
export { readCommand as showSkill } from "./commands/read.ts";
export {
	getBuiltinSkillsDir,
	getSkillDirs,
	getUserSkillsDir,
} from "./paths.ts";
