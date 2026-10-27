import { DAY_MS, parseIsoDate } from "./dates";
import { FlagRegistryError } from "./errors";
import { isFlagKind, resolveMaxLifetimeDays } from "./lifetimes";
import type { DefineFlagsOptions, FlagDefinition, MaxLifetimeDays } from "./types";

const KEY_PATTERN = /^[a-z][a-z0-9-.]{1,79}$/;

/**
 * Validates a flag register and returns a frozen, normalized copy.
 *
 * Throws `FlagRegistryError` with a `code` for the first invalid entry.
 * A flag kind with a finite maximum lifetime requires `expiresAt`, so that a flag
 * cannot escape the limit by omitting the date.
 */
export function defineFlags(
	definitions: readonly FlagDefinition[],
	options?: DefineFlagsOptions,
): readonly FlagDefinition[] {
	if (!Array.isArray(definitions)) {
		throw new FlagRegistryError("INVALID_DEFINITION", "defineFlags expects an array of flags");
	}
	const maxLifetimeDays = resolveMaxLifetimeDays(options?.maxLifetimeDays);

	const seen = new Set<string>();
	const result: FlagDefinition[] = [];
	for (const [index, raw] of definitions.entries()) {
		const flag = validateDefinition(raw, index, maxLifetimeDays);
		if (seen.has(flag.key)) {
			throw new FlagRegistryError("DUPLICATE_KEY", `Duplicate flag key "${flag.key}"`, flag.key);
		}
		seen.add(flag.key);
		result.push(flag);
	}
	return Object.freeze(result);
}

function validateDefinition(
	raw: unknown,
	index: number,
	maxLifetimeDays: MaxLifetimeDays,
): FlagDefinition {
	if (typeof raw !== "object" || raw === null) {
		throw new FlagRegistryError("INVALID_DEFINITION", `Flag at index ${index} is not an object`);
	}
	const record = raw as Record<string, unknown>;

	const key = record.key;
	if (typeof key !== "string" || !KEY_PATTERN.test(key)) {
		throw new FlagRegistryError(
			"INVALID_KEY",
			`Invalid flag key at index ${index}: ${JSON.stringify(key)} (must match ${KEY_PATTERN.source})`,
			typeof key === "string" ? key : undefined,
		);
	}

	const owner = record.owner;
	if (typeof owner !== "string" || owner.trim() === "") {
		throw new FlagRegistryError("EMPTY_OWNER", `Flag "${key}" has no owner`, key);
	}

	const kind = record.kind;
	if (!isFlagKind(kind)) {
		throw new FlagRegistryError(
			"INVALID_KIND",
			`Flag "${key}" has invalid kind ${JSON.stringify(kind)}`,
			key,
		);
	}

	const createdAt = record.createdAt;
	const createdMs = parseIsoDate(createdAt);
	if (createdMs === undefined) {
		throw new FlagRegistryError(
			"INVALID_DATE",
			`Flag "${key}" has invalid createdAt ${JSON.stringify(createdAt)}`,
			key,
		);
	}

	const expiresAt = record.expiresAt;
	let expiresMs: number | undefined;
	if (expiresAt !== undefined) {
		expiresMs = parseIsoDate(expiresAt);
		if (expiresMs === undefined) {
			throw new FlagRegistryError(
				"INVALID_DATE",
				`Flag "${key}" has invalid expiresAt ${JSON.stringify(expiresAt)}`,
				key,
			);
		}
		if (expiresMs <= createdMs) {
			throw new FlagRegistryError(
				"EXPIRY_NOT_AFTER_CREATION",
				`Flag "${key}" expires at ${String(expiresAt)}, which is not after createdAt`,
				key,
			);
		}
	}

	const maxDays = maxLifetimeDays[kind];
	if (maxDays !== null) {
		if (expiresMs === undefined) {
			throw new FlagRegistryError(
				"MISSING_EXPIRY",
				`Flag "${key}" (${kind}) needs an expiresAt, the maximum lifetime is ${maxDays} days`,
				key,
			);
		}
		if (expiresMs - createdMs > maxDays * DAY_MS) {
			throw new FlagRegistryError(
				"EXCEEDS_MAX_LIFETIME",
				`Flag "${key}" (${kind}) lives longer than the maximum of ${maxDays} days`,
				key,
			);
		}
	}

	const description = record.description;
	if (description !== undefined && typeof description !== "string") {
		throw new FlagRegistryError(
			"INVALID_DESCRIPTION",
			`Flag "${key}" has a non-string description`,
			key,
		);
	}

	const flag: FlagDefinition = { key, owner, kind, createdAt: createdAt as string };
	if (expiresAt !== undefined) {
		flag.expiresAt = expiresAt as string;
	}
	if (description !== undefined) {
		flag.description = description;
	}
	return flag;
}
