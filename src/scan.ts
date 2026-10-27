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
 *
 * Text in comments, and template literals (backticks), are ignored, including `${...}`
 * placeholders in template literals that are not code. Calls inside `${...}` are still scanned.
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
	const code = maskNonCode(sourceText);
	const keys = new Set<string>();

	if (functions.length > 0) {
		const alternation = functions.map(escapeRegExp).join("|");
		// Only the call form. The literal must be closed by the same quote character.
		const callPattern = new RegExp(
			String.raw`\b(?:${alternation})\s*\(\s*(["'])([^"'\\\r\n]{1,${MAX_LITERAL_LENGTH}})\1`,
			"g",
		);
		for (const match of code.matchAll(callPattern)) {
			const key = match[2];
			if (key !== undefined) {
				keys.add(key);
			}
		}
	}

	// `flags.key` is only matched for identifier-like keys, and not for method calls like
	// `flags.get(` or chained access like `flags.a.b`.
	for (const match of code.matchAll(/\bflags\.([a-z][a-z0-9]*)(?![\w.-]|\s*\()/g)) {
		const key = match[1];
		if (key !== undefined) {
			keys.add(key);
		}
	}

	const bracketPattern = new RegExp(
		String.raw`\bflags\s*\[\s*(["'])([^"'\\\r\n]{1,${MAX_LITERAL_LENGTH}})\1\s*\]`,
		"g",
	);
	for (const match of code.matchAll(bracketPattern)) {
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
	const out = source.split("");
	const n = source.length;
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
			i = source[j] === ch ? j + 1 : j;
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

	return out.join("");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
