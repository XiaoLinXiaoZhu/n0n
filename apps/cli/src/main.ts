#!/usr/bin/env bun

import { CommanderError } from "commander";
import { CliUsageError, createProgram } from "./program.ts";

export async function runCli(argv: string[] = process.argv): Promise<number> {
	const program = createProgram();
	try {
		await program.parseAsync(argv);
		return 0;
	} catch (error) {
		if (error instanceof CliUsageError) {
			console.error(error.message);
			program.outputHelp();
			return 1;
		}
		if (error instanceof CommanderError) {
			if (
				error.code === "commander.helpDisplayed" ||
				error.code === "commander.version"
			) {
				return 0;
			}
			return error.exitCode;
		}
		const message = error instanceof Error ? error.message : String(error);
		console.error(`错误: ${message}`);
		return 1;
	}
}

if (import.meta.main) {
	process.exitCode = await runCli();
}
