/**
 * 从 JSONL 配置文件加载 PATH 工具的白名单/黑名单规则
 */

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

export interface PathToolsConfig {
	whitelist: Set<string>;
	blacklistDirPatterns: RegExp[];
	blacklistNamePrefixes: string[];
	blacklistNamePatterns: RegExp[];
	blacklistNameExact: Set<string>;
}

export function loadPathToolsConfig(): PathToolsConfig {
	const configPath = join(dirname(import.meta.path), "path-tools.jsonl");
	const content = readFileSync(configPath, "utf8");

	const config: PathToolsConfig = {
		whitelist: new Set(),
		blacklistDirPatterns: [],
		blacklistNamePrefixes: [],
		blacklistNamePatterns: [],
		blacklistNameExact: new Set(),
	};

	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const entry = JSON.parse(trimmed);

		switch (entry.type) {
			case "whitelist":
				for (const t of entry.tools) config.whitelist.add(t);
				break;
			case "blacklist-dir-pattern":
				for (const p of entry.patterns) config.blacklistDirPatterns.push(new RegExp(p, "i"));
				break;
			case "blacklist-name-prefix":
				config.blacklistNamePrefixes.push(...entry.prefixes);
				break;
			case "blacklist-name-pattern":
				for (const p of entry.patterns) config.blacklistNamePatterns.push(new RegExp(p, "i"));
				break;
			case "blacklist-name-exact":
				for (const t of entry.tools) config.blacklistNameExact.add(t);
				break;
		}
	}

	return config;
}
