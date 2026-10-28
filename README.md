# @yedoma-labs/kulyn-flags

<picture>
  <source media="(max-width: 640px)" srcset="https://raw.githubusercontent.com/yedoma-labs/assets/main/resized/banner-resized-mobile.png">
  <img src="https://raw.githubusercontent.com/yedoma-labs/assets/main/resized/banner-resized.png" alt="Project Header">
</picture>

[![CI](https://github.com/yedoma-labs/kulyn-flags/actions/workflows/ci.yml/badge.svg)](https://github.com/yedoma-labs/kulyn-flags/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@yedoma-labs/kulyn-flags.svg)](https://www.npmjs.com/package/@yedoma-labs/kulyn-flags)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A flag register with owners and expiry dates, plus hygiene checks you run in CI.
It answers the question that runtime flag SDKs leave open: **who owns this flag, and is it safe to delete?**

## The problem

Teams add feature flags and never remove them. After a year nobody knows:

- who owns a flag,
- whether the code still reads it,
- whether it can be deleted without changing behavior.

Runtime SDKs evaluate flags well. They do not track the lifecycle of a flag. This library fills that gap with a small data format and checks that you run in tests or CI.

## Installation

```sh
pnpm add -D @yedoma-labs/kulyn-flags
```

Requires Node.js 20 or newer. It has no runtime dependencies.

## Quickstart

### 1. Register your flags

```ts
// flags.register.ts
import { defineFlags } from "@yedoma-labs/kulyn-flags";

export const flags = defineFlags([
	{
		key: "checkout.new-ui",
		owner: "team-checkout",
		kind: "release",
		createdAt: "2026-01-12",
		expiresAt: "2026-03-31",
		description: "Replaces the legacy checkout page",
	},
	{
		key: "ops.maintenance-banner",
		owner: "platform",
		kind: "ops",
		createdAt: "2026-02-01",
		expiresAt: "2027-02-01",
	},
	{
		key: "perm.beta-admin",
		owner: "platform",
		kind: "permission",
		createdAt: "2025-11-03",
	},
]);
```

`defineFlags` throws a `FlagRegistryError` with a `code` for the first invalid entry, for example a duplicate key, a missing owner, an invalid date or a lifetime that is too long.

### 2. Add a CI test

```ts
// tests/flag-hygiene.test.ts
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { assertFlagHygiene, checkFlagHygiene, findFlagKeysInSource } from "@yedoma-labs/kulyn-flags";
import { flags } from "../flags.register";

function readSources(dir: string): string {
	return readdirSync(dir, { recursive: true })
		.map(String)
		.filter((name) => name.endsWith(".ts") || name.endsWith(".tsx"))
		.map((name) => readFileSync(join(dir, name), "utf8"))
		.join("\n");
}

describe("feature flag hygiene", () => {
	it("has no expired, overlong or unused flags, and no unregistered usage", () => {
		const usedKeys = findFlagKeysInSource(readSources("src"));
		const findings = checkFlagHygiene({ flags, usedKeys });
		assertFlagHygiene(findings);
	});
});
```

`assertFlagHygiene` throws a `FlagHygieneError` that lists every finding. Pass `failOn` to fail only on some codes:

```ts
assertFlagHygiene(findings, { failOn: ["EXPIRED", "UNREGISTERED_USAGE"] });
```

## Lifecycle rules

### Register

| Field         | Rule                                                                                  |
| ------------- | ------------------------------------------------------------------------------------- |
| `key`         | Matches `/^[a-z][a-z0-9-.]{1,79}$/`. Keys are unique.                                  |
| `owner`       | Must not be blank.                                                                    |
| `kind`        | `release`, `experiment`, `ops` or `permission`.                                       |
| `createdAt`   | ISO date (`2026-01-12`) or date-time with a timezone (`2026-01-12T10:00:00Z`).       |
| `expiresAt`   | Same format. Must be after `createdAt`.                                               |
| `description` | Optional string.                                                                      |

Default maximum lifetimes:

| Kind         | Max lifetime | `expiresAt` required |
| ------------ | ------------ | -------------------- |
| `release`    | 90 days      | yes                  |
| `experiment` | 30 days      | yes                  |
| `ops`        | 365 days     | yes                  |
| `permission` | no limit     | no                   |

A kind with a finite limit requires `expiresAt`. Otherwise a flag could avoid the limit by omitting the date.
Lifetimes are measured from `createdAt` to `expiresAt`. A lifetime equal to the maximum is allowed.

Override the limits per kind. Use `null` to remove a limit:

```ts
defineFlags(flags, {
	maxLifetimeDays: { release: 120, experiment: null },
});
```

### Hygiene findings

| Code                    | Meaning                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `EXPIRED`               | `now` is at or after `expiresAt`. The expiry instant itself counts as expired.           |
| `EXCEEDS_MAX_LIFETIME`  | The lifetime is longer than the current limit for its kind. Catches flags registered before a limit was lowered. |
| `UNUSED`                | The flag is registered but its key was not found in the code. Only with `usedKeys`.      |
| `UNREGISTERED_USAGE`    | A key is used in the code but not registered. Only with `usedKeys`.                      |

`UNUSED` and `UNREGISTERED_USAGE` are only produced when you pass `usedKeys`. Findings are sorted by key, then by code, so the output is stable and diff-friendly.

## API

- `defineFlags(flags, options?)` validates a register and returns a frozen copy.
- `checkFlagHygiene({ flags, now?, usedKeys?, maxLifetimeDays? })` returns an array of findings.
- `assertFlagHygiene(findings, { failOn? })` throws `FlagHygieneError` when a finding matches `failOn`. The default is all codes.
- `findFlagKeysInSource(sourceText, { functions? })` returns a `Set` of keys. The default function names are `isEnabled`, `getFlag`, `flag` and `evaluate`. The library does not read files. Pass in the text.
- Errors: `FlagRegistryError` (with `code` and `key`) and `FlagHygieneError` (with `code` and `findings`).

## How the source scan works

`findFlagKeysInSource` recognizes:

- calls with a string literal as the first argument: `isEnabled("key")`, `getFlag('key')`, `client.isEnabled("key", { fallback: false })`
- property access: `flags.beta`, `flags["new-ui"]`
- the optional-chaining forms of both: `isEnabled?.("key")`, `flags?.beta`, `flags?.["new-ui"]`

It ignores text in comments, in template literals (`` `isEnabled("x")` `` is not a call) and in quoted strings (`"flags.old"` is text, not a use). It does scan calls inside `${...}` placeholders. Template literals used as call arguments, such as ``getFlag(`key`)``, are not matched. Keys must be written as literals to be found.

The scan runs in linear time and does not use nested quantifiers. Long inputs stay fast.

## Limitations

- The scan is static. Keys computed at runtime, such as `isEnabled(prefix + name)`, are not found. Flags that are only reached through such calls appear as `UNUSED`. Pass the relevant keys in `usedKeys` or narrow `failOn`.
- Regex literals that contain quote characters are not understood. A quote inside a regex can hide code on the same line.
- Dates are checked against the calendar. Date-times need an explicit timezone.
- The library checks the register. It does not know which flags are on or off in production.

## Not a runtime SDK

This library does not evaluate flags. It does not decide whether a user sees a feature, and it has no network access. For that, use [OpenFeature](https://openfeature.dev/) with its server SDK, [Unleash](https://www.getunleash.io/) or [Flagsmith](https://www.flagsmith.com/).

Use `kulyn-flags` alongside them. Keep the register in your repository, run the hygiene check in CI, and delete flags once the findings say they are safe to remove.

## License

MIT. See [LICENSE](LICENSE).
