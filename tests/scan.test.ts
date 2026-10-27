import { describe, expect, it } from "vitest";
import { findFlagKeysInSource } from "../src/index";
import { maskNonCode } from "../src/scan";

function keysOf(source: string, functions?: string[]): string[] {
	return [...findFlagKeysInSource(source, functions ? { functions } : undefined)].sort();
}

describe("findFlagKeysInSource", () => {
	it("returns a Set", () => {
		expect(findFlagKeysInSource("")).toBeInstanceOf(Set);
	});

	describe("function calls", () => {
		it.each([
			['isEnabled("checkout.new-ui")', "checkout.new-ui"],
			["isEnabled('checkout.new-ui')", "checkout.new-ui"],
			['getFlag("a")', "a"],
			['flag("a-b")', "a-b"],
			['evaluate("a1.b2")', "a1.b2"],
			['client.isEnabled("via.member")', "via.member"],
			['isEnabled("with.options", { default: false })', "with.options"],
			['if (isEnabled("in.if")) {}', "in.if"],
			['await getFlag(\n  "multi.line"\n)', "multi.line"],
			['isEnabled ( "spaced" )', "spaced"],
		])("finds the key in %s", (source, key) => {
			expect(keysOf(source)).toEqual([key]);
		});

		it("collapses duplicate keys into one entry", () => {
			expect(keysOf('isEnabled("dup"); getFlag("dup"); isEnabled("dup")')).toEqual(["dup"]);
		});

		it("returns invalid-looking literals too, so the hygiene check can report them", () => {
			expect(keysOf('isEnabled("Not Valid")')).toEqual(["Not Valid"]);
		});

		it("ignores calls with non-literal arguments", () => {
			expect(keysOf("isEnabled(key)")).toEqual([]);
			expect(keysOf('isEnabled("a" + suffix)')).toEqual([]);
			expect(keysOf('isEnabled(prefix + "a")')).toEqual([]);
		});

		it("does not match names that only contain a configured function name", () => {
			expect(keysOf('myflag("x")')).toEqual([]);
			expect(keysOf('isEnabledAsync("x")')).toEqual([]);
			expect(keysOf('getFlagValue("x")')).toEqual([]);
			expect(keysOf('getFlag2("x")')).toEqual([]);
		});

		it("does not match literals that contain the other quote character or are unterminated", () => {
			expect(keysOf(`isEnabled("it's")`)).toEqual([]);
			expect(keysOf(`isEnabled('say "hi"')`)).toEqual([]);
			expect(keysOf('isEnabled("open)')).toEqual([]);
		});

		it("does not read keys with escaped quotes", () => {
			expect(keysOf('isEnabled("a\\"b")')).toEqual([]);
		});

		it("uses only the configured function names", () => {
			const source = 'isEnabled("a"); hasFeature("b"); isOn("c")';
			expect(keysOf(source, ["hasFeature", "isOn"])).toEqual(["b", "c"]);
			expect(keysOf(source, [])).toEqual([]);
		});

		it("escapes regex characters in configured function names", () => {
			expect(keysOf('a.b("x"); aXb("y")', ["a.b"])).toEqual(["x"]);
			expect(keysOf('f+("x")', ["f+"])).toEqual(["x"]);
			expect(keysOf('fff("x")', ["f+"])).toEqual([]);
		});
	});

	describe("flags property access", () => {
		it('finds flags.key and flags["key"]', () => {
			expect(keysOf("if (flags.newCheckout) {}")).toEqual([]);
			expect(keysOf("if (flags.beta) {}")).toEqual(["beta"]);
			expect(keysOf("flags[\"new-ui\"] && flags['other.one']")).toEqual(["new-ui", "other.one"]);
		});

		it("skips method calls and chained access on flags", () => {
			expect(keysOf("flags.get('x')")).toEqual([]);
			expect(keysOf("flags.beta.enabled")).toEqual([]);
			expect(keysOf("flags.beta(")).toEqual([]);
		});

		it("does not match flags as part of a longer identifier", () => {
			expect(keysOf("myflags.beta")).toEqual([]);
			expect(keysOf("flagsBeta.x")).toEqual([]);
		});
	});

	describe("template literals and comments", () => {
		it("does not match calls written as template literals", () => {
			expect(keysOf("isEnabled(`checkout.new-ui`)")).toEqual([]);
			expect(keysOf("getFlag(`x${suffix}`)")).toEqual([]);
		});

		it("does not match call-like text inside template literal text", () => {
			expect(keysOf('const doc = `Use isEnabled("fake") here`;')).toEqual([]);
			expect(keysOf("const doc = `flags.fake`;")).toEqual([]);
		});

		it("still matches calls inside template literal placeholders", () => {
			expect(keysOf('const s = `prefix ${isEnabled("inside")} done`;')).toEqual(["inside"]);
		});

		it("handles nested template literals and braces inside placeholders", () => {
			const source =
				'const s = `a ${ `b ${ {x: 1}.x } ${isEnabled("nested")}` } c`; isEnabled("outer");';
			expect(keysOf(source)).toEqual(["nested", "outer"]);
		});

		it("ignores calls in line comments", () => {
			expect(keysOf('// isEnabled("commented")\nisEnabled("real")')).toEqual(["real"]);
		});

		it("ignores calls in block comments", () => {
			expect(keysOf('/* getFlag("commented") */ getFlag("real")')).toEqual(["real"]);
			expect(keysOf('/*\n isEnabled("x")\n*/')).toEqual([]);
		});

		it("does not treat comment markers inside strings as comments", () => {
			const source = 'const url = "https://example.com/*"; isEnabled("real");';
			expect(keysOf(source)).toEqual(["real"]);
		});

		it("does not treat backticks inside strings as template literals", () => {
			expect(keysOf('const q = "`"; isEnabled("after.quote");')).toEqual(["after.quote"]);
		});
	});

	it("handles an unterminated string without throwing or reading past the line", () => {
		const source = 'const broken = "oops\nisEnabled("real")';
		expect(keysOf(source)).toEqual(["real"]);
	});
});

describe("maskNonCode", () => {
	it("keeps the length and line breaks", () => {
		const source = 'a // comment\n`tpl ${x} text`\n/* block\n */ "str"';
		const masked = maskNonCode(source);
		expect(masked.length).toBe(source.length);
		expect(masked.split("\n").length).toBe(source.split("\n").length);
	});

	it("keeps string literal contents and masks comments and template text", () => {
		const masked = maskNonCode('x("keep") // gone\n`gone`');
		expect(masked).toContain('"keep"');
		expect(masked).not.toContain("gone");
	});
});

describe("findFlagKeysInSource performance", () => {
	const SIZE = 1_000_000;
	const LIMIT_MS = 1500;

	const cases: Array<[string, string]> = [
		["long whitespace after call name", `isEnabled(${" ".repeat(SIZE)}`],
		["long unterminated literal", `isEnabled("${"a".repeat(SIZE)}`],
		["long literal with trailing garbage", `isEnabled("${"a".repeat(SIZE)}"${" ".repeat(SIZE)}`],
		["many call names without arguments", "isEnabled ".repeat(SIZE / 10)],
		["long flags property", `flags.${"a".repeat(SIZE)}`],
		["many unterminated template opens", "`${".repeat(SIZE / 3)],
		["many unclosed block comments", "/*".repeat(SIZE / 2)],
		["many line comments", '// isEnabled("x")\n'.repeat(SIZE / 20)],
		["many escapes in a string", `isEnabled("${"\\".repeat(SIZE)}`],
		["many quotes", '"'.repeat(SIZE)],
	];

	it.each(cases)("finishes quickly for %s", (_name, source) => {
		const started = performance.now();
		findFlagKeysInSource(source, { functions: ["isEnabled", "getFlag", "flag", "evaluate"] });
		const elapsed = performance.now() - started;
		expect(elapsed).toBeLessThan(LIMIT_MS);
	});
});
