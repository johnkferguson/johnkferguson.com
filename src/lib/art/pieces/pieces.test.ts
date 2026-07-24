import { describe, expect, test } from "bun:test";
import { palette } from "../../palette";
import { artSvg, DEFAULT_QUIET } from "../generate";
import { PIECES } from "./index";

/* Pieces are pinned in frontmatter as (piece, seed, params) and
 * regenerated every build, so they must be deterministic and must only
 * emit colors the OG pipeline can pin. */

const SIZES = [
	{ width: 1600, height: 640 }, // post backdrop
	{ width: 800, height: 560 }, // homepage thumbnail
	{ width: 1200, height: 630 }, // OG card
];

describe.each(Object.keys(PIECES))("piece %s", (name) => {
	test("renders deterministically for a fixed seed", () => {
		const opts = {
			seedKey: "fixed-seed",
			piece: name,
			width: 1600,
			height: 640,
			quiet: DEFAULT_QUIET,
			quietStrength: 0.4,
		};
		expect(artSvg(opts)).toBe(artSvg(opts));
	});

	test("produces well-formed output at every consumer size", () => {
		for (const size of SIZES) {
			const svg = artSvg({ seedKey: "fixed-seed", piece: name, ...size });
			expect(svg.startsWith("<svg")).toBe(true);
			expect(svg).not.toContain("NaN");
			expect(svg).not.toContain("undefined");
		}
	});

	test("only emits colors the OG pipeline can pin", () => {
		/* several seeds: color choices are probabilistic per element */
		for (const seedKey of ["a", "b", "c", "d"]) {
			const svg = artSvg({ seedKey, piece: name, width: 1200, height: 630 });
			for (const [, prop] of svg.matchAll(/var\((--[a-z0-9-]+)\)/gi)) {
				expect(Object.keys(palette.dark)).toContain(prop);
			}
		}
	});

	test("motion adds animation without changing geometry", () => {
		const base = {
			seedKey: "fixed-seed",
			piece: name,
			width: 1600,
			height: 640,
			quiet: DEFAULT_QUIET,
			quietStrength: 0.4,
		};
		const still = artSvg(base);
		const animated = artSvg({ ...base, animate: true });
		expect(animated).toContain("<animate");
		/* stripping the animation nodes must recover the static render
		 * exactly: motion draws from a separate seeded stream */
		const stripped = animated
			.replaceAll(/<animate(?:Transform)?\b[^>]*\/>/g, "")
			.replaceAll("></rect>", "/>");
		expect(stripped).toBe(still);
	});

	test("param overrides change the output", () => {
		const spec = PIECES[name].params[0];
		const base = { seedKey: "fixed-seed", piece: name };
		expect(artSvg({ ...base, params: { [spec.key]: spec.max } })).not.toBe(
			artSvg({ ...base, params: { [spec.key]: spec.min } }),
		);
	});
});

test("an unknown piece fails the build instead of shipping fallback art", () => {
	expect(() => artSvg({ seedKey: "x", piece: "no-such-piece" })).toThrow(
		'unknown art piece "no-such-piece"',
	);
});
