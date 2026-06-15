/**
 * ConfigLoader — 配置加载与显示
 *
 * 仅 re-export。各子模块：
 * - schema.ts  — Zod schema + 类型定义
 * - paths.ts   — 路径解析
 * - loader.ts  — 配置加载逻辑
 * - display.ts — 终端显示
 */

// 向后兼容：DEFAULT_TOML 重新导出
export { DEFAULT_TOML } from "../config-defaults.ts";
export { displayCodeConfig } from "./display.ts";
export {
	type ConfigLoadError,
	type ConfigLoadResult,
	type LoadedConfig,
	loadCodeConfig,
} from "./loader.ts";
export { type ConfigPaths, resolveConfigPaths } from "./paths.ts";
export { type CodeSettings, codeConfigSchema } from "./schema.ts";
