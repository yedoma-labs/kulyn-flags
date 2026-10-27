import { FlagRegistryError } from "./errors";
import type { FlagKind, LifetimeOverrides, MaxLifetimeDays } from "./types";

export const FLAG_KINDS: readonly FlagKind[] = ["release", "experiment", "ops", "permission"];

/**
 * Default maximum lifetimes. `permission` flags may live without limit.
 */
export const DEFAULT_MAX_LIFETIME_DAYS: MaxLifetimeDays = Object.freeze({
	release: 90,
	experiment: 30,
	ops: 365,
	permission: null,
});

export function isFlagKind(value: unknown): value is FlagKind {
	return typeof value === "string" && (FLAG_KINDS as readonly string[]).includes(value);
}

/**
 * Merges user overrides into the defaults and validates them.
 */
export function resolveMaxLifetimeDays(overrides: LifetimeOverrides | undefined): MaxLifetimeDays {
	const resolved: Record<FlagKind, number | null> = { ...DEFAULT_MAX_LIFETIME_DAYS };
	if (overrides === undefined) {
		return resolved;
	}
	if (typeof overrides !== "object" || overrides === null) {
		throw new FlagRegistryError("INVALID_OPTIONS", "maxLifetimeDays must be an object");
	}

	for (const kind of Object.keys(overrides)) {
		if (!isFlagKind(kind)) {
			throw new FlagRegistryError(
				"INVALID_OPTIONS",
				`Unknown flag kind in maxLifetimeDays: "${kind}"`,
			);
		}
		const value = overrides[kind];
		if (value === undefined) {
			continue;
		}
		if (value !== null && !(Number.isInteger(value) && value > 0)) {
			throw new FlagRegistryError(
				"INVALID_OPTIONS",
				`maxLifetimeDays.${kind} must be a positive integer or null, got ${String(value)}`,
			);
		}
		resolved[kind] = value;
	}
	return resolved;
}
