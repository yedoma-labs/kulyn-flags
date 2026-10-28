import type { FindFlagKeysOptions } from "./types";

const DEFAULT_FUNCTIONS: readonly string[] = ["isEnabled", "getFlag", "flag", "evaluate"];

/** Upper bound for a key literal. Longer literals are ignored. */
const MAX_LITERAL_LENGTH = 100;

/**
 * Finds flag keys in source text.
 *
 * Recognized forms, with single or double quotes:
 * - `isEnabled("key")`, `getFlag('key')` and the other configured function names
 * - `flags.key` (identifier-style keys only)
 * - `flags["key"]`
 * - the optional-chaining forms `isEnabled?.("key")`, `flags?.key` and `flags?.["key"]`
 *
 * Text in comments, and template literals (backticks), are ignored, including `${...}`
 * placeholders in template literals that are not code. Calls inside `${...}` are still scanned.
 * Calls and property access written inside a quoted string (`"isEnabled('x')"`) are ignored,
 * because they are text, not code.
 * This function does not read files. The caller passes the text.
 *
 * Limitations: regex literals containing quotes are not understood. A quote inside a
 * regex literal can hide code on the same line.
 */
export function findFlagKeysInSource(
	sourceText: string,
	options?: FindFlagKeysOptions,
): Set<string> {
	const functions = options?.functions ?? DEFAULT_FUNCTIONS;
	const { code, stringRanges } = maskWithStrings(sourceText);
	const keys = new Set<string>();

	if (functions.length > 0) {
		const alternation = functions.map(escapeRegExp).join("|");
		// The literal must be closed by the same quote and be a whole argument, so that
		// `isEnabled("a" + b)` is not read as the key "a".
		const callPattern = new RegExp(
			String.raw`\b(?:${alternation})\s*(?:\?\.\s*)?\(\s*(["'])([^"'\\\r\n]{1,${MAX_LITERAL_LENGTH}})\1(?=\s*[,)])`,
			"g",
		);
		for (const match of code.matchAll(callPattern)) {
			if (isInRanges(stringRanges, match.index)) {
				continue;
			}
			const key = match[2];
			if (key !== undefined) {
				keys.add(key);
			}
		}
	}

	// `flags.key` is only matched for identifier-like keys, and not for method calls like
	// `flags.get(` or chained access like `flags.a.b`.
	for (const match of code.matchAll(/\bflags(?:\?\.|\.)([a-z][a-z0-9]*)(?![\w.-]|\?\.|\s*\()/g)) {
		if (isInRanges(stringRanges, match.index)) {
			continue;
		}
		const key = match[1];
		if (key !== undefined) {
			keys.add(key);
		}
	}

	const bracketPattern = new RegExp(
		String.raw`\bflags\s*(?:\?\.\s*)?\[\s*(["'])([^"'\\\r\n]{1,${MAX_LITERAL_LENGTH}})\1\s*\]`,
		"g",
	);
	for (const match of code.matchAll(bracketPattern)) {
		if (isInRanges(stringRanges, match.index)) {
			continue;
		}
		const key = match[2];
		if (key !== undefined) {
			keys.add(key);
		}
	}

	return keys;
}

type Frame = { kind: "template" } | { kind: "code"; braces: number; interpolation: boolean };

/**
 * Returns `source` with comments and template-literal text replaced by spaces.
 * Newlines are kept, so the output has the same length and line structure.
 * Single- and double-quoted strings are kept, because keys are read from them.
 * Runs in linear time: each character is visited a constant number of times.
 */
export function maskNonCode(source: string): string {
	return maskWithStrings(source).code;
}

/**
 * Like `maskNonCode`, and also returns the ranges of quoted string literals as flat
 * `[start, end, start, end, ...]` pairs (end is exclusive), in source order.
 */
function maskWithStrings(source: string): { code: string; stringRanges: number[] } {
	const out = source.split("");
	const n = source.length;
	const stringRanges: number[] = [];
	const frames: Frame[] = [{ kind: "code", braces: 0, interpolation: false }];

	const mask = (from: number, to: number): void => {
		for (let k = from; k < to; k++) {
			if (out[k] !== "\n" && out[k] !== "\r") {
				out[k] = " ";
			}
		}
	};

	let i = 0;
	while (i < n) {
		const top = frames[frames.length - 1];
		if (top === undefined) {
			break;
		}
		const ch = source[i];
		const next = source[i + 1];

		if (top.kind === "template") {
			if (ch === "\\") {
				mask(i, i + 2);
				i += 2;
			} else if (ch === "`") {
				mask(i, i + 1);
				frames.pop();
				i++;
			} else if (ch === "$" && next === "{") {
				mask(i, i + 2);
				frames.push({ kind: "code", braces: 0, interpolation: true });
				i += 2;
			} else {
				mask(i, i + 1);
				i++;
			}
			continue;
		}

		if (ch === "/" && next === "/") {
			const newline = source.indexOf("\n", i);
			const end = newline === -1 ? n : newline;
			mask(i, end);
			i = end;
		} else if (ch === "/" && next === "*") {
			const close = source.indexOf("*/", i + 2);
			const end = close === -1 ? n : close + 2;
			mask(i, end);
			i = end;
		} else if (ch === '"' || ch === "'") {
			// Strings end at the matching quote or at a line break (unterminated string).
			let j = i + 1;
			while (j < n && source[j] !== ch && source[j] !== "\n") {
				j += source[j] === "\\" ? 2 : 1;
			}
			const end = source[j] === ch ? j + 1 : j;
			stringRanges.push(i, end);
			i = end;
		} else if (ch === "`") {
			mask(i, i + 1);
			frames.push({ kind: "template" });
			i++;
		} else if (ch === "{") {
			top.braces++;
			i++;
		} else if (ch === "}") {
			if (top.interpolation && top.braces === 0) {
				mask(i, i + 1);
				frames.pop();
			} else if (top.braces > 0) {
				top.braces--;
			}
			i++;
		} else {
			i++;
		}
	}

	return { code: out.join(""), stringRanges };
}

/** True when `index` lies in one of the sorted `[start, end)` pairs of `ranges`. */
function isInRanges(ranges: readonly number[], index: number | undefined): boolean {
	if (index === undefined) {
		return false;
	}
	let lo = 0;
	let hi = ranges.length / 2 - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const start = ranges[mid * 2] ?? 0;
		const end = ranges[mid * 2 + 1] ?? 0;
		if (index < start) {
			hi = mid - 1;
		} else if (index >= end) {
			lo = mid + 1;
		} else {
			return true;
		}
	}
	return false;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
