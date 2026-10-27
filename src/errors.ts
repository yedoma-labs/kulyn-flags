import type { HygieneCode, HygieneFinding } from "./types";

export type FlagRegistryErrorCode =
	| "INVALID_DEFINITION"
	| "INVALID_KEY"
	| "DUPLICATE_KEY"
	| "EMPTY_OWNER"
	| "INVALID_KIND"
	| "INVALID_DESCRIPTION"
	| "INVALID_DATE"
	| "EXPIRY_NOT_AFTER_CREATION"
	| "MISSING_EXPIRY"
	| "EXCEEDS_MAX_LIFETIME"
	| "INVALID_OPTIONS";

/**
 * Thrown when a flag register or its options are invalid.
 */
export class FlagRegistryError extends Error {
	readonly code: FlagRegistryErrorCode;
	/** The offending flag key, when it is known. */
	readonly key: string | undefined;

	constructor(code: FlagRegistryErrorCode, message: string, key?: string) {
		super(message);
		this.name = "FlagRegistryError";
		this.code = code;
		this.key = key;
	}
}

/**
 * Thrown by `assertFlagHygiene` when findings match the `failOn` codes.
 */
export class FlagHygieneError extends Error {
	readonly code: HygieneCode;
	readonly findings: readonly HygieneFinding[];

	constructor(findings: readonly HygieneFinding[]) {
		const lines = findings.map((finding) => `  - [${finding.code}] ${finding.message}`);
		super(`Flag hygiene check failed with ${findings.length} finding(s):\n${lines.join("\n")}`);
		this.name = "FlagHygieneError";
		this.code = findings[0]?.code ?? "UNUSED";
		this.findings = findings;
	}
}
