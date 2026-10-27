import { DAY_MS, parseIsoDate } from "./dates";
import { FlagHygieneError, FlagRegistryError } from "./errors";
import { isFlagKind, resolveMaxLifetimeDays } from "./lifetimes";
import type {
	AssertFlagHygieneOptions,
	CheckFlagHygieneOptions,
	FlagDefinition,
	HygieneCode,
	HygieneFinding,
} from "./types";

/** Order of codes in the result when two findings share a key. */
const CODE_ORDER: readonly HygieneCode[] = [
	"EXPIRED",
	"EXCEEDS_MAX_LIFETIME",
	"UNUSED",
	"UNREGISTERED_USAGE",
];

/**
 * Checks a flag register for flags that should be cleaned up.
 *
 * - `EXPIRED`: `now` is at or after `expiresAt`.
 * - `EXCEEDS_MAX_LIFETIME`: the flag lives longer than the configured maximum for its kind.
 *   This catches flags registered before a limit was lowered.
 * - `UNUSED`: only when `usedKeys` is given. The key is registered but not used.
 * - `UNREGISTERED_USAGE`: only when `usedKeys` is given. The key is used but not registered.
 *
 * Findings are sorted by key, then by code.
 */
export function checkFlagHygiene(options: CheckFlagHygieneOptions): readonly HygieneFinding[] {
	const nowMs = resolveNow(options.now);
	const lifetimes = resolveMaxLifetimeDays(options.maxLifetimeDays);

	const registered = new Set<string>();
	const findings: HygieneFinding[] = [];

	for (const flag of options.flags) {
		if (registered.has(flag.key)) {
			throw new FlagRegistryError("DUPLICATE_KEY", `Duplicate flag key "${flag.key}"`, flag.key);
		}
		registered.add(flag.key);
		collectLifecycleFindings(flag, nowMs, lifetimes[flag.kind], findings);
	}

	if (options.usedKeys !== undefined) {
		const used = new Set(options.usedKeys);
		for (const key of registered) {
			if (!used.has(key)) {
				findings.push({
					key,
					code: "UNUSED",
					message: `Flag "${key}" is registered but not used`,
				});
			}
		}
		for (const key of used) {
			if (!registered.has(key)) {
				findings.push({
					key,
					code: "UNREGISTERED_USAGE",
					message: `Flag "${key}" is used but not registered`,
				});
			}
		}
	}

	return findings.sort(
		(a, b) =>
			compareStrings(a.key, b.key) || CODE_ORDER.indexOf(a.code) - CODE_ORDER.indexOf(b.code),
	);
}

/**
 * Throws `FlagHygieneError` if any finding has a code listed in `failOn`.
 * Defaults to all codes. Use it in tests or CI.
 */
export function assertFlagHygiene(
	findings: readonly HygieneFinding[],
	options?: AssertFlagHygieneOptions,
): void {
	const failOn = new Set<HygieneCode>(options?.failOn ?? CODE_ORDER);
	const failing = findings.filter((finding) => failOn.has(finding.code));
	if (failing.length > 0) {
		throw new FlagHygieneError(failing);
	}
}

function collectLifecycleFindings(
	flag: FlagDefinition,
	nowMs: number,
	maxDays: number | null | undefined,
	findings: HygieneFinding[],
): void {
	if (!isFlagKind(flag.kind)) {
		throw new FlagRegistryError("INVALID_KIND", `Flag "${flag.key}" has invalid kind`, flag.key);
	}
	const createdMs = parseIsoDate(flag.createdAt);
	if (createdMs === undefined) {
		throw new FlagRegistryError(
			"INVALID_DATE",
			`Flag "${flag.key}" has invalid createdAt`,
			flag.key,
		);
	}
	if (flag.expiresAt === undefined) {
		return;
	}
	const expiresMs = parseIsoDate(flag.expiresAt);
	if (expiresMs === undefined) {
		throw new FlagRegistryError(
			"INVALID_DATE",
			`Flag "${flag.key}" has invalid expiresAt`,
			flag.key,
		);
	}

	if (nowMs >= expiresMs) {
		findings.push({
			key: flag.key,
			code: "EXPIRED",
			message: `Flag "${flag.key}" expired at ${flag.expiresAt}`,
		});
	}

	if (maxDays !== null && maxDays !== undefined) {
		const lifetimeMs = expiresMs - createdMs;
		if (lifetimeMs > maxDays * DAY_MS) {
			findings.push({
				key: flag.key,
				code: "EXCEEDS_MAX_LIFETIME",
				message: `Flag "${flag.key}" (${flag.kind}) lives ${lifetimeMs / DAY_MS} days, the maximum is ${maxDays}`,
			});
		}
	}
}

function resolveNow(now: Date | undefined): number {
	if (now === undefined) {
		return Date.now();
	}
	const time = now.getTime();
	if (Number.isNaN(time)) {
		throw new FlagRegistryError("INVALID_OPTIONS", "now is an invalid Date");
	}
	return time;
}

function compareStrings(a: string, b: string): number {
	if (a === b) {
		return 0;
	}
	return a < b ? -1 : 1;
}
