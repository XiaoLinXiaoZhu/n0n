import type { ParsedExec } from "../schemes/exec.ts";
import { parsePostUri } from "../uri.ts";

/**
 * 测试辅助：解析 exec uri 并窄化到 ParsedExec。
 * 测试内 uri 已知为 exec://，非 exec 即测试构造错误。
 */
export function parseExecUri(uri: string): ParsedExec {
	const parsed = parsePostUri(uri);
	if (parsed.scheme !== "exec") {
		throw new Error(`parseExecUri: expected exec:// uri, got "${uri}"`);
	}
	return parsed;
}
