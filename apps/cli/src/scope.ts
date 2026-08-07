export const SCOPES = ["global", "local", "all"] as const;
export type Scope = (typeof SCOPES)[number];

export function parseScope(value: string): Scope {
	const scope = SCOPES.find((candidate) => candidate === value);
	if (scope === undefined) {
		throw new Error(`未知范围 "${value}"，可用: ${SCOPES.join(", ")}`);
	}
	return scope;
}
