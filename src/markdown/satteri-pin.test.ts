import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) =>
	JSON.parse(readFileSync(join(import.meta.dir, "../..", path), "utf8"));

/**
 * `@astrojs/markdown-satteri` is a direct dependency here only so the plugins
 * can import `satteri()`; astro depends on it too, at an exact version. If the
 * two drift, two copies resolve and the processor astro checks for is not
 * necessarily the one whose options were built.
 *
 * That drift is quiet by construction: `@astrojs/mdx` identifies the processor
 * with `p.name === "satteri"` (dist/processor-guards.js), a plain string, so a
 * mismatched second copy is still accepted and any behavior difference shows
 * up as wrong output rather than an error. Hence a test: it is the only thing
 * that makes it loud, and it costs nothing.
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
		const hoisted = read("node_modules/@astrojs/markdown-satteri/package.json");
		expect(hoisted.version).toBe(
			read("package.json").dependencies["@astrojs/markdown-satteri"],
		);
	});
});
