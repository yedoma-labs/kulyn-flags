import { describe, expect, it } from "vitest";
import type { FlagDefinition } from "../src/index";
import { defineFlags, FlagRegistryError } from "../src/index";

function flag(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
	return {
		key: "checkout.new-ui",
		owner: "team-checkout",
		kind: "release",
		createdAt: "2026-01-01",
		expiresAt: "2026-02-01",
		...overrides,
	};
}

function codeOf(fn: () => unknown): string | undefined {
	try {
		fn();
	} catch (error) {
		expect(error).toBeInstanceOf(FlagRegistryError);
		return (error as FlagRegistryError).code;
	}
	return undefined;
}

describe("defineFlags", () => {
	it("returns a frozen, normalized copy of valid flags", () => {
		const result = defineFlags([flag({ description: "Shows the new checkout" })]);

		expect(result).toEqual([
			{
				key: "checkout.new-ui",
				owner: "team-checkout",
				kind: "release",
				createdAt: "2026-01-01",
				expiresAt: "2026-02-01",
				description: "Shows the new checkout",
			},
		]);
		expect(Object.isFrozen(result)).toBe(true);
	});

	it("does not add optional keys that were not provided", () => {
		const [result] = defineFlags([
			{ key: "perm.admin", owner: "platform", kind: "permission", createdAt: "2026-01-01" },
		]);

		expect(result).toEqual({
			key: "perm.admin",
			owner: "platform",
			kind: "permission",
			createdAt: "2026-01-01",
		});
		expect(Object.keys(result ?? {})).not.toContain("expiresAt");
		expect(Object.keys(result ?? {})).not.toContain("description");
	});

	it("accepts an empty register", () => {
		expect(defineFlags([])).toEqual([]);
	});

	it("throws INVALID_DEFINITION when the input is not an array or an entry is not an object", () => {
		expect(codeOf(() => defineFlags({} as unknown as FlagDefinition[]))).toBe("INVALID_DEFINITION");
		expect(codeOf(() => defineFlags([null as unknown as FlagDefinition]))).toBe(
			"INVALID_DEFINITION",
		);
		expect(codeOf(() => defineFlags(["x" as unknown as FlagDefinition]))).toBe(
			"INVALID_DEFINITION",
		);
	});

	describe("key format", () => {
		it.each(["ab", "a1", "checkout", "checkout.new-ui", "a-b.c-d.e9", `a${"b".repeat(79)}`])(
			"accepts %s",
			(key) => {
				expect(() => defineFlags([flag({ key })])).not.toThrow();
			},
		);

		it.each([
			"a",
			"1abc",
			"Checkout",
			"checkout_new",
			"checkout new",
			"checkout/new",
			"-abc",
			`a${"b".repeat(80)}`,
			"",
		])("rejects %j with INVALID_KEY", (key) => {
			const error = captureError(() => defineFlags([flag({ key })]));
			expect(error).toBeInstanceOf(FlagRegistryError);
			expect(error?.code).toBe("INVALID_KEY");
		});

		it("rejects a non-string key", () => {
			expect(codeOf(() => defineFlags([flag({ key: 42 as unknown as string })]))).toBe(
				"INVALID_KEY",
			);
		});
	});

	it("throws DUPLICATE_KEY and reports the key", () => {
		const error = captureError(() => defineFlags([flag(), flag({ owner: "other" })]));
		expect(error?.code).toBe("DUPLICATE_KEY");
		expect(error?.key).toBe("checkout.new-ui");
	});

	it("throws EMPTY_OWNER for missing, blank or whitespace owners", () => {
		expect(codeOf(() => defineFlags([flag({ owner: "" })]))).toBe("EMPTY_OWNER");
		expect(codeOf(() => defineFlags([flag({ owner: "   " })]))).toBe("EMPTY_OWNER");
		expect(codeOf(() => defineFlags([flag({ owner: undefined as unknown as string })]))).toBe(
			"EMPTY_OWNER",
		);
	});

	it("throws INVALID_KIND for unknown kinds", () => {
		expect(codeOf(() => defineFlags([flag({ kind: "feature" as unknown as "release" })]))).toBe(
			"INVALID_KIND",
		);
	});

	it("throws INVALID_DESCRIPTION for a non-string description", () => {
		expect(codeOf(() => defineFlags([flag({ description: 1 as unknown as string })]))).toBe(
			"INVALID_DESCRIPTION",
		);
	});

	describe("dates", () => {
		it.each([
			"2026-01-01",
			"2028-02-29",
			"2026-01-01T00:00:00Z",
			"2026-01-01T10:30Z",
			"2026-01-01T10:30:15.123+01:00",
			"2026-01-01T10:30:15.123456789-05:30",
		])("accepts createdAt %s", (createdAt) => {
			expect(() =>
				defineFlags([flag({ kind: "permission", createdAt, expiresAt: undefined })]),
			).not.toThrow();
		});

		it.each([
			"2026-02-30",
			"2026-02-29",
			"2026-04-31",
			"2026-13-01",
			"2026-00-10",
			"2026-01-00",
			"2026-1-01",
			"01-01-2026",
			"2026-01-01T24:00Z",
			"2026-01-01T10:60Z",
			"2026-01-01T10:00:60Z",
			"2026-01-01T10:00:00",
			"2026-01-01T10:00:00+25:00",
			"2026-01-01T10:00:00+01:60",
			"2026-01-01 10:00Z",
			"2026-01-01t10:00z",
			"not a date",
			"",
		])("rejects createdAt %j with INVALID_DATE", (createdAt) => {
			expect(codeOf(() => defineFlags([flag({ createdAt, expiresAt: undefined })]))).toBe(
				"INVALID_DATE",
			);
		});

		it("rejects an invalid expiresAt with INVALID_DATE", () => {
			expect(codeOf(() => defineFlags([flag({ expiresAt: "2026-02-31" })]))).toBe("INVALID_DATE");
		});

		it("rejects expiresAt equal to createdAt", () => {
			expect(
				codeOf(() => defineFlags([flag({ createdAt: "2026-01-01", expiresAt: "2026-01-01" })])),
			).toBe("EXPIRY_NOT_AFTER_CREATION");
		});

		it("rejects expiresAt before createdAt", () => {
			expect(
				codeOf(() => defineFlags([flag({ createdAt: "2026-01-10", expiresAt: "2026-01-09" })])),
			).toBe("EXPIRY_NOT_AFTER_CREATION");
		});

		it("compares timestamps across timezones", () => {
			// 2026-01-01T01:00+01:00 is 2026-01-01T00:00Z, so this is equal, not after
			expect(
				codeOf(() =>
					defineFlags([
						flag({
							createdAt: "2026-01-01T00:00:00Z",
							expiresAt: "2026-01-01T01:00:00+01:00",
						}),
					]),
				),
			).toBe("EXPIRY_NOT_AFTER_CREATION");
		});
	});

	describe("maximum lifetime", () => {
		it("accepts release flags at exactly 90 days", () => {
			// 2026-01-01 to 2026-04-01 is exactly 90 days
			expect(() =>
				defineFlags([flag({ kind: "release", createdAt: "2026-01-01", expiresAt: "2026-04-01" })]),
			).not.toThrow();
		});

		it("rejects release flags 1 millisecond over 90 days", () => {
			expect(
				codeOf(() =>
					defineFlags([
						flag({
							kind: "release",
							createdAt: "2026-01-01",
							expiresAt: "2026-04-01T00:00:00.001Z",
						}),
					]),
				),
			).toBe("EXCEEDS_MAX_LIFETIME");
		});

		it("applies the experiment default of 30 days", () => {
			const base = { kind: "experiment" as const, createdAt: "2026-01-01" };
			expect(() => defineFlags([flag({ ...base, expiresAt: "2026-01-31" })])).not.toThrow();
			expect(codeOf(() => defineFlags([flag({ ...base, expiresAt: "2026-02-01" })]))).toBe(
				"EXCEEDS_MAX_LIFETIME",
			);
		});

		it("applies the ops default of 365 days", () => {
			const base = { kind: "ops" as const, createdAt: "2026-01-01" };
			expect(() => defineFlags([flag({ ...base, expiresAt: "2027-01-01" })])).not.toThrow();
			expect(codeOf(() => defineFlags([flag({ ...base, expiresAt: "2027-01-02" })]))).toBe(
				"EXCEEDS_MAX_LIFETIME",
			);
		});

		it("requires expiresAt for kinds with a finite maximum", () => {
			expect(codeOf(() => defineFlags([flag({ kind: "release", expiresAt: undefined })]))).toBe(
				"MISSING_EXPIRY",
			);
			expect(codeOf(() => defineFlags([flag({ kind: "ops", expiresAt: undefined })]))).toBe(
				"MISSING_EXPIRY",
			);
		});

		it("allows permission flags without expiry", () => {
			expect(() => defineFlags([flag({ kind: "permission", expiresAt: undefined })])).not.toThrow();
		});

		it("allows permission flags with a very long lifetime", () => {
			expect(() =>
				defineFlags([
					flag({ kind: "permission", createdAt: "2026-01-01", expiresAt: "2036-01-01" }),
				]),
			).not.toThrow();
		});

		it("lets overrides raise the limit for a kind", () => {
			const register = [
				flag({ kind: "release", createdAt: "2026-01-01", expiresAt: "2026-07-01" }),
			];
			expect(codeOf(() => defineFlags(register))).toBe("EXCEEDS_MAX_LIFETIME");
			expect(() => defineFlags(register, { maxLifetimeDays: { release: 181 } })).not.toThrow();
		});

		it("lets null disable the limit, so expiresAt becomes optional", () => {
			expect(() =>
				defineFlags([flag({ kind: "release", expiresAt: undefined })], {
					maxLifetimeDays: { release: null },
				}),
			).not.toThrow();
		});

		it("lets overrides lower the limit for a kind", () => {
			expect(
				codeOf(() =>
					defineFlags([flag({ kind: "experiment", expiresAt: "2026-01-15" })], {
						maxLifetimeDays: { experiment: 10 },
					}),
				),
			).toBe("EXCEEDS_MAX_LIFETIME");
		});

		it("keeps defaults for kinds that are not overridden", () => {
			expect(
				codeOf(() =>
					defineFlags(
						[flag({ kind: "experiment", createdAt: "2026-01-01", expiresAt: "2026-02-01" })],
						{
							maxLifetimeDays: { release: 120 },
						},
					),
				),
			).toBe("EXCEEDS_MAX_LIFETIME");
		});

		it("applies a permission limit when one is configured", () => {
			expect(
				codeOf(() =>
					defineFlags([flag({ kind: "permission", expiresAt: undefined })], {
						maxLifetimeDays: { permission: 30 },
					}),
				),
			).toBe("MISSING_EXPIRY");
		});

		it.each([
			{ release: 0 },
			{ release: -5 },
			{ release: 1.5 },
			{ release: Number.NaN },
			{ release: "90" },
		])("rejects invalid override %j with INVALID_OPTIONS", (overrides) => {
			expect(codeOf(() => defineFlags([flag()], { maxLifetimeDays: overrides as never }))).toBe(
				"INVALID_OPTIONS",
			);
		});

		it("rejects unknown kinds in overrides", () => {
			expect(
				codeOf(() => defineFlags([flag()], { maxLifetimeDays: { feature: 10 } as never })),
			).toBe("INVALID_OPTIONS");
		});
	});
});

function captureError(fn: () => unknown): FlagRegistryError | undefined {
	try {
		fn();
	} catch (error) {
		return error as FlagRegistryError;
	}
	return undefined;
}
