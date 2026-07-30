import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "../..");
const committed = join(root, "public/katex");
const installed = join(root, "node_modules/katex/dist");

const woff2 = (dir: string) =>
	readdirSync(join(dir, "fonts"))
		.filter((f) => f.endsWith(".woff2"))
		.sort();

/**
 * `public/katex/` is a committed copy of the installed katex package, produced
 * by `scripts/build-katex.py`, because `katex.min.css` reaches its faces
 * through relative `url(fonts/...)` and PostLayout serves it as a static link.
 *
 * A copy can drift from the package it was copied from, and that drift is
 * invisible: nothing imports these files, so no build step compares them.
 * It is also not hypothetical. Two real cases:
 *
 * - katex 0.18.0 renamed every internal class (`.base` -> `.katex-base`,
 *   `.strut`, `.sizing`). Bumping the package without re-running the script
 *   serves 0.16 CSS against 0.18 markup, and every formula on the page
 *   collapses into a column of loose characters with no build error.
 * - a local tree once wandered to a katex the lockfile did not name, so the
 *   committed CSS and the renderer were different versions already.
 *
 * The plugin's own tests cannot catch either: they assert the public class
 * names (`katex`, `katex-display`, `katex-mathml`), which 0.18 kept, not the
 * internal ones that moved. Hence a byte comparison, which catches any skew
 * whether or not it happens to be a rename.
 */
describe("public/katex is in sync with the installed katex", () => {
	test("katex.min.css is byte-identical to the package's", () => {
		expect(readFileSync(join(committed, "katex.min.css"))).toEqual(
			readFileSync(join(installed, "katex.min.css")),
		);
	});

	test("every woff2 face is present and byte-identical", () => {
		const faces = woff2(installed);
		expect(faces.length).toBeGreaterThan(0);
		expect(woff2(committed)).toEqual(faces);
		for (const face of faces) {
			expect(readFileSync(join(committed, "fonts", face))).toEqual(
				readFileSync(join(installed, "fonts", face)),
			);
		}
	});

	/* the script copies woff2 only: modern browsers never fetch the woff/ttf
	 * fallbacks listed after it in each @font-face src, and committing them
	 * would quadruple the weight for nothing */
	test("only woff2 is committed", () => {
		const committedFonts = readdirSync(join(committed, "fonts"));
		expect(committedFonts.filter((f) => !f.endsWith(".woff2"))).toEqual([]);
	});
});
