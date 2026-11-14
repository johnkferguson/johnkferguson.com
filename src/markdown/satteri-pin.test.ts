import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const text = (path: string) =>
	readFileSync(join(import.meta.dir, "../..", path), "utf8");
const read = (path: string) => JSON.parse(text(path));

/** Versions of `name` that pnpm-lock.yaml installs. */
const locked = (name: string): string[] =>
	Object.keys(parse(text("pnpm-lock.yaml")).packages)
		.filter((key) => key.startsWith(`${name}@`))
		.map((key) => key.slice(name.length + 1));

/**
 * `@astrojs/markdown-satteri` is a direct dependency here only so the plugins
 * can import `satteri()`; astro depends on it too, at an exact version. If the
 * two drift, two copies resolve and the processor astro checks for is not
 * necessarily the one whose options were built.
 *
 * That drift is quiet by construction: `@astrojs/mdx` identifies the processor
 * through `isSatteriProcessor`, which checks `p.name === "satteri"`
 * (@astrojs/markdown-satteri dist/processor.js), a plain string, so a
 * mismatched second copy is still accepted and any behavior difference shows
 * up as wrong output rather than an error. Hence a test: it is the only thing
 * that makes it loud, and it costs nothing.
 *
 * The same holds one level down for `satteri` itself: the plugins import it
 * directly and the tests run them on that copy, while astro builds with the
 * one @astrojs/markdown-satteri resolves. Its range there can move a 0.x
 * minor inside an astro patch (0.4.7 took it to ^0.11), so a lockfile with
 * two copies means the tests and the build disagree about what ran.
 *
 * The copy checks read pnpm-lock.yaml rather than node_modules: under pnpm,
 * the root node_modules entry is always the direct dependency, so it shows
 * the pinned version even when a second copy is installed beside it.
 */
describe("@astrojs/markdown-satteri pin", () => {
	test("matches the exact version astro depends on", () => {
		const ours = read("package.json").dependencies["@astrojs/markdown-satteri"];
		const theirs = read("node_modules/astro/package.json").dependencies[
			"@astrojs/markdown-satteri"
		];
		expect(theirs).toBeString();
		/* exact, not a range: a caret here would let a newer release resolve
		 * alongside astro's pinned copy */
		expect(ours).toBe(theirs);
	});

	test("only one copy is installed", () => {
		expect(locked("@astrojs/markdown-satteri")).toEqual([
			read("package.json").dependencies["@astrojs/markdown-satteri"],
		]);
	});

	test("only one satteri is installed", () => {
		expect(locked("satteri")).toHaveLength(1);
	});
});
