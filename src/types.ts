/**
 * Why a flag exists. Each kind has its own default maximum lifetime.
 */
export type FlagKind = "release" | "experiment" | "ops" | "permission";

/**
 * A single entry in the flag register.
 *
 * Dates are ISO 8601 strings. `createdAt` and `expiresAt` accept `YYYY-MM-DD` or a
 * date-time with an explicit timezone (`Z` or `+HH:MM`).
 */
export interface FlagDefinition {
	/** Flag key, e.g. `checkout.new-ui`. Must match `/^[a-z][a-z0-9-.]{1,79}$/`. */
	key: string;
	/** Team or person responsible for removing the flag. Must not be blank. */
	owner: string;
	kind: FlagKind;
	createdAt: string;
	/** Date after which the flag is considered expired. */
	expiresAt?: string;
	description?: string;
}

/**
 * Per-kind maximum lifetime in days. `null` disables the limit for that kind.
 */
export type MaxLifetimeDays = Readonly<Record<FlagKind, number | null>>;

/**
 * Overrides for the default maximum lifetimes. Keys that are omitted keep their default.
 */
export type LifetimeOverrides = Partial<Record<FlagKind, number | null>>;

export interface DefineFlagsOptions {
	maxLifetimeDays?: LifetimeOverrides;
}

export type HygieneCode = "EXPIRED" | "EXCEEDS_MAX_LIFETIME" | "UNUSED" | "UNREGISTERED_USAGE";

export interface HygieneFinding {
	key: string;
	code: HygieneCode;
	message: string;
}

export interface CheckFlagHygieneOptions {
	flags: readonly FlagDefinition[];
	/** Reference time for expiry checks. Defaults to the current time. */
	now?: Date;
	/**
	 * Flag keys found in the code base. When omitted, no usage findings are produced.
	 */
	usedKeys?: Iterable<string>;
	/** Maximum lifetimes used for `EXCEEDS_MAX_LIFETIME`. Defaults match `defineFlags`. */
	maxLifetimeDays?: LifetimeOverrides;
}

export interface AssertFlagHygieneOptions {
	/** Finding codes that cause a throw. Defaults to all codes. */
	failOn?: readonly HygieneCode[];
}

export interface FindFlagKeysOptions {
	/**
	 * Function names whose first string argument is a flag key.
	 * Defaults to `isEnabled`, `getFlag`, `flag` and `evaluate`.
	 */
	functions?: readonly string[];
}
