/**
 * config/types — 公共类型定义
 *
 * config 模块是通用的 TOML 配置加载器，不包含业务领域知识。
 */

// ── ConfigSource ──

export interface ConfigSource {
	/** 来源名称，用于错误消息和 trace（如 "全局"、"项目"） */
	name: string;
	/** TOML 文本内容 */
	content: string;
}

// ── Trace ──

export interface TraceEntry {
	value: unknown;
	source: string;
}

/** dot-path → 来源信息 */
export type Trace = Record<string, TraceEntry>;

// ── 错误类型（可辨联合） ──

export type ConfigError =
	| TOMLParseError
	| EnvVarNotFoundError
	| ExtendTargetNotFoundError
	| CircularExtendError
	| SchemaValidationError;

export interface TOMLParseError {
	kind: "toml_parse_error";
	sourceName: string;
	message: string;
}

export interface EnvVarNotFoundError {
	kind: "env_var_not_found";
	varName: string;
	/** 哪个配置源引用了这个变量 */
	sourceName: string;
	message: string;
}

export interface ExtendTargetNotFoundError {
	kind: "extend_target_not_found";
	/** extend 值（如 "providers.anthropic"） */
	targetPath: string;
	/** extend 所在的父路径 */
	parentPath: string;
	message: string;
}

export interface CircularExtendError {
	kind: "circular_extend";
	/** 环路径 */
	chain: string[];
	message: string;
}

export interface SchemaValidationError {
	kind: "schema_validation_error";
	message: string;
}

// ── Result ──

export interface ConfigSuccess<T> {
	success: true;
	data: T;
	trace: Trace;
}

export interface ConfigFailure {
	success: false;
	errors: ConfigError[];
}

export type ConfigResult<T> = ConfigSuccess<T> | ConfigFailure;
