import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { estimateTokens, headByTokens, tailByTokens } from "@n0n/shared";

export interface ReadOptions {
	path?: string;
	cursor?: number;
	tokens?: number;
	tail?: boolean;
	lines?: { start: number; end: number };
	stdin?: Uint8Array;
	/** stdin 缓冲区在原始字节流中的起始位置。 */
	stdinBaseCursor?: number;
	/** stdin 缓冲区是否已经到达原始流 EOF。 */
	stdinEof?: boolean;
	/** stdin 已由流式读取器裁剪为目标行范围。 */
	stdinLinesSelected?: boolean;
}

export interface ReadMetadata {
	startCursor: number;
	endCursor: number;
	nextCursor: number | null;
	eof: boolean;
	bytes: number;
	tokens: number;
	limit: "eof" | "tokens" | "bytes" | "lines";
}

export interface ReadResult {
	text: string;
	metadata: ReadMetadata;
}

const DEFAULT_TOKENS = 2_000;
const MAX_BYTES = 64 * 1024;

function decodeUtf8(bytes: Uint8Array): string {
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function validateOptions(options: ReadOptions): void {
	const modes = [
		options.cursor !== undefined,
		options.tail === true,
		options.lines !== undefined,
	].filter(Boolean).length;
	if (modes > 1) {
		throw new Error("--cursor, --tail and --lines are mutually exclusive");
	}
	if (
		options.cursor !== undefined &&
		(!Number.isInteger(options.cursor) || options.cursor < 0)
	) {
		throw new Error("--cursor must be a non-negative integer");
	}
	const tokens = options.tokens ?? DEFAULT_TOKENS;
	if (!Number.isInteger(tokens) || tokens <= 0) {
		throw new Error("--tokens must be a positive integer");
	}
	if (
		options.lines &&
		(!Number.isInteger(options.lines.start) ||
			!Number.isInteger(options.lines.end) ||
			options.lines.start < 1 ||
			options.lines.end < options.lines.start)
	) {
		throw new Error("--lines must use a positive inclusive range: <start:end>");
	}
	if (options.tail && !options.path) {
		throw new Error("--tail requires a file input");
	}
}

function clampUtf8Start(bytes: Uint8Array, offset: number): number {
	let start = Math.min(offset, bytes.length);
	while (start < bytes.length && ((bytes[start] ?? 0) & 0xc0) === 0x80) {
		start++;
	}
	return start;
}

function clampUtf8End(bytes: Uint8Array, end: number): number {
	let safeEnd = Math.min(end, bytes.length);
	while (safeEnd > 0) {
		try {
			decodeUtf8(bytes.subarray(0, safeEnd));
			return safeEnd;
		} catch {
			safeEnd--;
		}
	}
	return 0;
}

function fitBudget(
	text: string,
	tokenBudget: number,
): {
	text: string;
	limit: "tokens" | "bytes" | "eof";
} {
	if (estimateTokens(text) > tokenBudget) {
		return { text: headByTokens(text, tokenBudget), limit: "tokens" };
	}
	return { text, limit: "eof" };
}

function makeResult(
	text: string,
	startCursor: number,
	totalBytes: number,
	limit: ReadMetadata["limit"],
): ReadResult {
	const bytes = Buffer.byteLength(text, "utf8");
	const endCursor = startCursor + bytes;
	const eof = endCursor >= totalBytes;
	return {
		text,
		metadata: {
			startCursor,
			endCursor,
			nextCursor: eof ? null : endCursor,
			eof,
			bytes,
			tokens: estimateTokens(text),
			limit: eof ? "eof" : limit,
		},
	};
}

function readForwardBytes(
	source: Uint8Array,
	requestedCursor: number,
	tokenBudget: number,
	baseCursor = 0,
	sourceEof = true,
): ReadResult {
	const localCursor = Math.max(0, requestedCursor - baseCursor);
	const start = clampUtf8Start(source, localCursor);
	const requestedEnd = Math.min(source.length, start + MAX_BYTES);
	const end =
		clampUtf8End(source.subarray(start), requestedEnd - start) + start;
	const raw = source.subarray(start, end);
	const decoded = decodeUtf8(raw);
	const fitted = fitBudget(decoded, tokenBudget);
	const byteLimited =
		(end < source.length || !sourceEof) && fitted.limit === "eof";
	const result = makeResult(
		fitted.text,
		baseCursor + start,
		sourceEof ? baseCursor + source.length : Number.POSITIVE_INFINITY,
		byteLimited ? "bytes" : fitted.limit,
	);
	return sourceEof
		? result
		: {
				...result,
				metadata: {
					...result.metadata,
					eof: false,
					nextCursor: result.metadata.endCursor,
				},
			};
}

function readFileForward(
	path: string,
	requestedCursor: number,
	tokenBudget: number,
): ReadResult {
	const fd = openSync(path, "r");
	try {
		const totalBytes = fstatSync(fd).size;
		if (requestedCursor >= totalBytes) {
			return makeResult("", totalBytes, totalBytes, "eof");
		}
		const probe = Buffer.alloc(
			Math.min(MAX_BYTES + 4, totalBytes - requestedCursor),
		);
		const read = readSync(fd, probe, 0, probe.length, requestedCursor);
		const bytes = probe.subarray(0, read);
		const localStart = clampUtf8Start(bytes, 0);
		const startCursor = requestedCursor + localStart;
		const requestedEnd = Math.min(bytes.length, localStart + MAX_BYTES);
		const safeEnd =
			clampUtf8End(bytes.subarray(localStart), requestedEnd - localStart) +
			localStart;
		const available = bytes.subarray(localStart, safeEnd);
		let decoded = decodeUtf8(available);
		const fitted = fitBudget(decoded, tokenBudget);
		decoded = fitted.text;
		const endCursor = startCursor + Buffer.byteLength(decoded, "utf8");
		const byteLimited = endCursor < totalBytes && fitted.limit === "eof";
		return makeResult(
			decoded,
			startCursor,
			totalBytes,
			byteLimited ? "bytes" : fitted.limit,
		);
	} finally {
		closeSync(fd);
	}
}

function readTail(path: string, tokenBudget: number): ReadResult {
	const fd = openSync(path, "r");
	try {
		const totalBytes = fstatSync(fd).size;
		const requestedStart = Math.max(0, totalBytes - MAX_BYTES - 4);
		const buffer = Buffer.alloc(totalBytes - requestedStart);
		const read = readSync(fd, buffer, 0, buffer.length, requestedStart);
		const bytes = buffer.subarray(0, read);
		const localStart = clampUtf8Start(
			bytes,
			requestedStart === 0 ? 0 : Math.min(4, bytes.length),
		);
		const decoded = decodeUtf8(bytes.subarray(localStart));
		const text = tailByTokens(decoded, tokenBudget);
		const textBytes = Buffer.byteLength(text, "utf8");
		return makeResult(text, totalBytes - textBytes, totalBytes, "eof");
	} finally {
		closeSync(fd);
	}
}

function readLines(
	source: Uint8Array,
	range: { start: number; end: number },
	tokenBudget: number,
	baseCursor = 0,
): ReadResult {
	const text = decodeUtf8(source);
	const lines = text.split("\n");
	const selected = lines.slice(range.start - 1, range.end).join("\n");
	const fitted = fitBudget(selected, tokenBudget);
	const prefix = lines.slice(0, range.start - 1).join("\n");
	const startCursor =
		baseCursor +
		(range.start === 1 ? 0 : Buffer.byteLength(`${prefix}\n`, "utf8"));
	const result = makeResult(
		fitted.text,
		startCursor,
		baseCursor + source.length,
		"lines",
	);
	return {
		...result,
		metadata: {
			...result.metadata,
			limit: fitted.limit === "tokens" ? "tokens" : "lines",
		},
	};
}

export function readText(options: ReadOptions): ReadResult {
	validateOptions(options);
	const tokenBudget = options.tokens ?? DEFAULT_TOKENS;
	const path =
		options.path && options.path !== "-" ? resolve(options.path) : undefined;

	if (options.tail) {
		if (!path) throw new Error("--tail requires a file input");
		return readTail(path, tokenBudget);
	}

	if (options.lines) {
		if (path) return readFileLines(path, options.lines, tokenBudget);
		const source = options.stdin;
		if (!source) throw new Error("stdin input is required");
		const range = options.stdinLinesSelected
			? {
					start: 1,
					end: options.lines.end - options.lines.start + 1,
				}
			: options.lines;
		const result = readLines(
			source,
			range,
			tokenBudget,
			options.stdinBaseCursor ?? 0,
		);
		if (options.stdinEof ?? true) return result;
		return {
			...result,
			metadata: {
				...result.metadata,
				eof: false,
				nextCursor: result.metadata.endCursor,
			},
		};
	}

	const cursor = options.cursor ?? 0;
	if (path) return readFileForward(path, cursor, tokenBudget);
	if (!options.stdin) throw new Error("stdin input is required");
	return readForwardBytes(
		options.stdin,
		cursor,
		tokenBudget,
		options.stdinBaseCursor ?? 0,
		options.stdinEof ?? true,
	);
}

function readFileLines(
	path: string,
	range: { start: number; end: number },
	tokenBudget: number,
): ReadResult {
	const fd = openSync(path, "r");
	try {
		const totalBytes = fstatSync(fd).size;
		const buffer = Buffer.alloc(64 * 1024);
		const selected: Uint8Array[] = [];
		let selectedBytes = 0;
		let absoluteOffset = 0;
		let selectedStart: number | null = null;
		let line = 1;
		let done = false;

		while (!done) {
			const read = readSync(fd, buffer, 0, buffer.length, absoluteOffset);
			if (read === 0) break;
			const bytes = buffer.subarray(0, read);
			let segmentStart = 0;
			for (let i = 0; i < bytes.length; i++) {
				if (line === range.start && selectedStart === null) {
					selectedStart = absoluteOffset + segmentStart;
				}
				if (bytes[i] !== 0x0a) continue;
				if (line >= range.start && line <= range.end) {
					const remaining = MAX_BYTES + 4 - selectedBytes;
					const part = bytes.subarray(
						segmentStart,
						Math.min(i + 1, segmentStart + remaining),
					);
					selected.push(part);
					selectedBytes += part.length;
				}
				line++;
				segmentStart = i + 1;
				if (line > range.end || selectedBytes >= MAX_BYTES + 4) {
					done = true;
					break;
				}
			}
			if (
				!done &&
				line >= range.start &&
				line <= range.end &&
				segmentStart < bytes.length
			) {
				if (selectedStart === null) {
					selectedStart = absoluteOffset + segmentStart;
				}
				const remaining = MAX_BYTES + 4 - selectedBytes;
				const part = bytes.subarray(segmentStart, segmentStart + remaining);
				selected.push(part);
				selectedBytes += part.length;
				if (selectedBytes >= MAX_BYTES + 4) done = true;
			}
			absoluteOffset += read;
		}

		const source = Buffer.concat(selected);
		const decoded = decodeUtf8(
			source.subarray(0, clampUtf8End(source, source.length)),
		);
		const fitted = fitBudget(decoded, tokenBudget);
		const startCursor = selectedStart ?? Math.min(absoluteOffset, totalBytes);
		const result = makeResult(fitted.text, startCursor, totalBytes, "lines");
		return {
			...result,
			metadata: {
				...result.metadata,
				limit: fitted.limit === "tokens" ? "tokens" : "lines",
			},
		};
	} finally {
		closeSync(fd);
	}
}

export function parseLineRange(value: string): { start: number; end: number } {
	const match = /^(\d+):(\d+)$/.exec(value);
	if (!match) throw new Error("--lines must use <start:end>");
	return { start: Number(match[1]), end: Number(match[2]) };
}

export async function readStdin(
	options: Pick<ReadOptions, "cursor" | "lines">,
): Promise<{
	bytes: Uint8Array;
	baseCursor: number;
	eof: boolean;
}> {
	if (options.lines) return readStdinLines(options.lines);

	const cursor = options.cursor ?? 0;
	const chunks: Uint8Array[] = [];
	let seen = 0;
	let collected = 0;
	let eof = true;
	for await (const chunk of process.stdin) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		const chunkEnd = seen + bytes.length;
		if (chunkEnd <= cursor) {
			seen = chunkEnd;
			continue;
		}
		const start = Math.max(0, cursor - seen);
		const remaining = MAX_BYTES + 4 - collected;
		if (remaining <= 0) {
			eof = false;
			break;
		}
		const selected = bytes.subarray(start, start + remaining);
		chunks.push(selected);
		collected += selected.length;
		seen = chunkEnd;
		if (collected >= MAX_BYTES + 4) {
			eof = false;
			break;
		}
	}
	return { bytes: Buffer.concat(chunks), baseCursor: cursor, eof };
}

async function readStdinLines(range: {
	start: number;
	end: number;
}): Promise<{ bytes: Uint8Array; baseCursor: number; eof: boolean }> {
	const selected: Uint8Array[] = [];
	let selectedBytes = 0;
	let absoluteOffset = 0;
	let selectedStart: number | null = null;
	let line = 1;
	let eof = true;

	for await (const chunk of process.stdin) {
		const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		let segmentStart = 0;
		for (let i = 0; i < bytes.length; i++) {
			if (line === range.start && selectedStart === null) {
				selectedStart = absoluteOffset + segmentStart;
			}
			if (bytes[i] !== 0x0a) continue;
			if (line >= range.start && line <= range.end) {
				const remaining = MAX_BYTES + 4 - selectedBytes;
				const part = bytes.subarray(
					segmentStart,
					Math.min(i + 1, segmentStart + remaining),
				);
				selected.push(part);
				selectedBytes += part.length;
			}
			line++;
			segmentStart = i + 1;
			if (line > range.end || selectedBytes >= MAX_BYTES + 4) {
				eof = false;
				break;
			}
		}
		if (line > range.end || selectedBytes >= MAX_BYTES + 4) break;
		if (
			line >= range.start &&
			line <= range.end &&
			segmentStart < bytes.length
		) {
			if (selectedStart === null) selectedStart = absoluteOffset + segmentStart;
			const remaining = MAX_BYTES + 4 - selectedBytes;
			const part = bytes.subarray(segmentStart, segmentStart + remaining);
			selected.push(part);
			selectedBytes += part.length;
			if (selectedBytes >= MAX_BYTES + 4) {
				eof = false;
				break;
			}
		}
		absoluteOffset += bytes.length;
	}

	return {
		bytes: Buffer.concat(selected),
		baseCursor: selectedStart ?? absoluteOffset,
		eof,
	};
}
