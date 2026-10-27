import { describe, expect, it } from "vitest";
import type { FlagDefinition, HygieneCode } from "../src/index";
import {
	assertFlagHygiene,
	checkFlagHygiene,
	FlagHygieneError,
	FlagRegistryError,
} from "../src/index";

function flag(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
	return {
		key: "checkout.new-ui",
		owner: "team-checkout",
		kind: "release",
		createdAt: "2026-01-01",
		expiresAt: "2026-03-01",
		...overrides,
	};
}

const NOW = new Date("2026-02-15T00:00:00Z");

function codesOf(findings: readonly { code: HygieneCode }[]): HygieneCode[] {
	return findings.map((finding) => finding.code);
}

describe("checkFlagHygiene", () => {
	describe("EXPIRED", () => {
		const expiresAt = "2026-02-01T00:00:00Z";
		const expiring = flag({ createdAt: "2026-01-01", expiresAt });

		it("is reported at exactly the expiry instant", () => {
			const findings = checkFlagHygiene({
				flags: [expiring],
				now: new Date("2026-02-01T00:00:00.000Z"),
			});
			expect(codesOf(findings)).toEqual(["EXPIRED"]);
		});

		it("is reported after the expiry instant", () => {
			const findings = checkFlagHygiene({
				flags: [expiring],
				now: new Date("2026-02-01T00:00:00.001Z"),
			});
			expect(codesOf(findings)).toEqual(["EXPIRED"]);
		});

		it("is not reported 1 millisecond before the expiry instant", () => {
			const findings = checkFlagHygiene({
				flags: [expiring],
				now: new Date("2026-01-31T23:59:59.999Z"),
			});
			expect(findings).toEqual([]);
		});

		it("includes the expiry date in the message and the key", () => {
			const [finding] = checkFlagHygiene({ flags: [expiring], now: NOW });
			expect(finding).toEqual({
				key: "checkout.new-ui",
				code: "EXPIRED",
				message: `Flag "checkout.new-ui" expired at ${expiresAt}`,
			});
		});

		it("uses the current time when now is omitted", () => {
			const findings = checkFlagHygiene({
				flags: [flag({ createdAt: "2000-01-01", expiresAt: "2000-02-01" })],
			});
			expect(codesOf(findings)).toEqual(["EXPIRED"]);
		});

		it("never reports flags without expiresAt as expired", () => {
			const findings = checkFlagHygiene({
				flags: [flag({ kind: "permission", expiresAt: undefined })],
				now: new Date("2100-01-01T00:00:00Z"),
			});
			expect(findings).toEqual([]);
		});
	});

	describe("EXCEEDS_MAX_LIFETIME", () => {
		it("is not reported for a lifetime of exactly the maximum", () => {
			// 90 days for release
			const findings = checkFlagHygiene({
				flags: [flag({ createdAt: "2026-01-01", expiresAt: "2026-04-01" })],
				now: new Date("2025-01-01T00:00:00Z"),
			});
			expect(findings).toEqual([]);
		});

		it("is reported 1 millisecond over the maximum", () => {
			const findings = checkFlagHygiene({
				flags: [flag({ createdAt: "2026-01-01", expiresAt: "2026-04-01T00:00:00.001Z" })],
				now: new Date("2025-01-01T00:00:00Z"),
			});
			expect(codesOf(findings)).toEqual(["EXCEEDS_MAX_LIFETIME"]);
			expect(findings[0]?.message).toContain("(release)");
		});

		it("applies the configured override", () => {
			const longRelease = flag({ createdAt: "2026-01-01", expiresAt: "2026-06-01" });
			const now = new Date("2025-01-01T00:00:00Z");
			expect(codesOf(checkFlagHygiene({ flags: [longRelease], now }))).toEqual([
				"EXCEEDS_MAX_LIFETIME",
			]);
			expect(
				checkFlagHygiene({
					flags: [longRelease],
					now,
					maxLifetimeDays: { release: 180 },
				}),
			).toEqual([]);
		});

		it("is never reported for kinds without a limit", () => {
			const findings = checkFlagHygiene({
				flags: [flag({ kind: "permission", createdAt: "2000-01-01", expiresAt: "2090-01-01" })],
				now: new Date("2025-01-01T00:00:00Z"),
			});
			expect(findings).toEqual([]);
		});
	});

	describe("usage", () => {
		const registered = [flag({ key: "a.one" }), flag({ key: "b.two" })];

		it("produces no usage findings when usedKeys is omitted", () => {
			const findings = checkFlagHygiene({ flags: registered, now: NOW });
			expect(findings).toEqual([]);
		});

		it("reports UNUSED for registered keys missing from usedKeys", () => {
			const findings = checkFlagHygiene({
				flags: registered,
				now: NOW,
				usedKeys: ["a.one"],
			});
			expect(findings).toEqual([
				{ key: "b.two", code: "UNUSED", message: 'Flag "b.two" is registered but not used' },
			]);
		});

		it("reports every registered key as UNUSED for an empty usedKeys", () => {
			const findings = checkFlagHygiene({ flags: registered, now: NOW, usedKeys: [] });
			expect(codesOf(findings)).toEqual(["UNUSED", "UNUSED"]);
		});

		it("reports UNREGISTERED_USAGE for used keys that are not registered", () => {
			const findings = checkFlagHygiene({
				flags: registered,
				now: NOW,
				usedKeys: ["a.one", "b.two", "c.three"],
			});
			expect(findings).toEqual([
				{
					key: "c.three",
					code: "UNREGISTERED_USAGE",
					message: 'Flag "c.three" is used but not registered',
				},
			]);
		});

		it("accepts any iterable and ignores duplicates in usedKeys", () => {
			function* keys(): Generator<string> {
				yield "a.one";
				yield "a.one";
				yield "zzz";
				yield "zzz";
			}
			const findings = checkFlagHygiene({ flags: registered, now: NOW, usedKeys: keys() });
			expect(findings.map((finding) => `${finding.code}:${finding.key}`)).toEqual([
				"UNUSED:b.two",
				"UNREGISTERED_USAGE:zzz",
			]);
		});
	});

	it("sorts findings by key and then by code, independent of input order", () => {
		const flags = [
			flag({ key: "zeta", createdAt: "2026-01-01", expiresAt: "2026-01-02" }),
			flag({ key: "alpha", createdAt: "2026-01-01", expiresAt: "2026-04-01T00:00:00.001Z" }),
			flag({ key: "mid" }),
		];
		const usedKeys = ["ghost", "zeta"];
		const options = { now: NOW, usedKeys };

		const forward = checkFlagHygiene({ flags, ...options });
		const reversed = checkFlagHygiene({ flags: [...flags].reverse(), ...options });

		expect(forward).toEqual(reversed);
		expect(forward.map((finding) => `${finding.key}:${finding.code}`)).toEqual([
			"alpha:EXCEEDS_MAX_LIFETIME",
			"alpha:UNUSED",
			"ghost:UNREGISTERED_USAGE",
			"mid:UNUSED",
			"zeta:EXPIRED",
		]);
	});

	it("returns an empty list for a clean register", () => {
		expect(checkFlagHygiene({ flags: [], now: NOW, usedKeys: [] })).toEqual([]);
	});

	it("throws FlagRegistryError for duplicate keys", () => {
		expect(() => checkFlagHygiene({ flags: [flag(), flag()], now: NOW })).toThrow(
			FlagRegistryError,
		);
	});

	it("throws FlagRegistryError for invalid dates instead of guessing", () => {
		expect(() =>
			checkFlagHygiene({ flags: [flag({ expiresAt: "2026-02-30" })], now: NOW }),
		).toThrow(FlagRegistryError);
	});

	it("throws FlagRegistryError for an invalid now date", () => {
		expect(() => checkFlagHygiene({ flags: [flag()], now: new Date("nope") })).toThrow(
			FlagRegistryError,
		);
	});
});

describe("assertFlagHygiene", () => {
	const expired = checkFlagHygiene({ flags: [flag()], now: new Date("2027-01-01T00:00:00Z") });
	const unused = checkFlagHygiene({
		flags: [flag({ kind: "permission", expiresAt: undefined })],
		now: NOW,
		usedKeys: [],
	});

	it("does not throw without findings", () => {
		expect(() => assertFlagHygiene([])).not.toThrow();
	});

	it("throws for any finding by default", () => {
		expect(() => assertFlagHygiene(expired)).toThrow(FlagHygieneError);
		expect(() => assertFlagHygiene(unused)).toThrow(FlagHygieneError);
	});

	it("only throws for codes listed in failOn", () => {
		expect(() => assertFlagHygiene(unused, { failOn: ["EXPIRED"] })).not.toThrow();
		expect(() => assertFlagHygiene(expired, { failOn: ["EXPIRED"] })).toThrow(FlagHygieneError);
		expect(() =>
			assertFlagHygiene(expired, { failOn: ["UNUSED", "UNREGISTERED_USAGE"] }),
		).not.toThrow();
	});

	it("does not throw when failOn is empty", () => {
		expect(() => assertFlagHygiene(expired, { failOn: [] })).not.toThrow();
	});

	it("exposes the failing findings and a code on the error", () => {
		const findings = [...expired, ...unused];
		try {
			assertFlagHygiene(findings, { failOn: ["EXPIRED"] });
			expect.unreachable("assertFlagHygiene should have thrown");
		} catch (error) {
			expect(error).toBeInstanceOf(FlagHygieneError);
			const hygieneError = error as FlagHygieneError;
			expect(hygieneError.name).toBe("FlagHygieneError");
			expect(hygieneError.code).toBe("EXPIRED");
			expect(hygieneError.findings).toEqual(expired);
			expect(hygieneError.message).toContain("[EXPIRED]");
			expect(hygieneError.message).toContain("checkout.new-ui");
		}
	});
});
