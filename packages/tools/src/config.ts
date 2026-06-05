/**
 * Tools 配置类型
 *
 * 使用 discriminated union 按 editBackendType 区分编辑后端配置，
 * 避免可选字段组合产生的无效状态。
 */

import type { LLMClient } from "@n0n/types";
import type { ResponsesClient } from "./edit/freeform-patch/index.ts";

interface ToolsConfigBase {
	security: {
		blocked_commands: string[];
	};
	agent: {
		default_exec_waitfor: number;
	};
	platform: "win32" | "darwin" | "linux";
	workspace: string;
	tempDir: string;
	bgSyncIntervalMs?: number;
}

interface StrReplaceToolsConfig extends ToolsConfigBase {
	editBackendType: "str-replace";
	editorClient: LLMClient;
}

interface FreeformPatchToolsConfig extends ToolsConfigBase {
	editBackendType: "freeform-patch";
	responsesClient: ResponsesClient;
}

export type ToolsConfig = StrReplaceToolsConfig | FreeformPatchToolsConfig;

export type { ResponsesClient } from "./edit/freeform-patch/index.ts";
