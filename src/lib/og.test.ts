import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { artSvg } from "./art/generate";
import {
	escapeXml,
	FONT_FILES,
	layoutTitle,
	missingGlyphs,
	OG,
	OG_FAMILY,
	pinArtColors,
	textWidth,
} from "./og";

const TITLE_WIDTH = OG.width - 90 * 2;

describe("textWidth", () => {
	test("scales linearly with size", () => {
		const a = textWidth("Refactoring", 36);
		const b = textWidth("Refactoring", 72);
		expect(b / a).toBeCloseTo(2, 5);
	});

	test("wide and narrow glyph runs differ sharply", () => {
		/* the reason a character budget cannot bound the layout */
		const wide = textWidth("M".repeat(26), 72);
		const narrow = textWidth("i".repeat(26), 72);
		expect(wide).toBeGreaterThan(narrow * 3);
	});
});

describe("layoutTitle", () => {
	const cases = [
		"Refactoring with Love",
		"Snapshot Fees: Pricing Liquidity From Within a Batch Auction",
		"WHY MARKET DESIGN MATTERS",
		"MMMMM MMMMM MMMMM MMMMM MMMMM",
		"A Reasonably Long Title That Keeps Going And Going For A While Yet",
		"Short",
	];

	for (const title of cases) {
		test(`no line overflows: ${title.slice(0, 32)}`, () => {
			const { lines, size } = layoutTitle(title, TITLE_WIDTH);
			expect(lines.length).toBeGreaterThan(0);
			for (const line of lines) {
				expect(textWidth(line, size)).toBeLessThanOrEqual(TITLE_WIDTH);
			}
		});
	}

	test("the all-caps case that clipped with a character budget now fits", () => {
		const title = "WHY MARKET DESIGN MATTERS";
		const { lines, size } = layoutTitle(title, TITLE_WIDTH);
		expect(textWidth(lines[0], size)).toBeLessThanOrEqual(TITLE_WIDTH);
		/* 25 chars was "within budget" yet ~1275px wide at size 72 */
		expect(textWidth(title, 72)).toBeGreaterThan(TITLE_WIDTH);
	});

	test("keeps every word, in order", () => {
		const title =
			"Snapshot Fees: Pricing Liquidity From Within a Batch Auction";
		const { lines } = layoutTitle(title, TITLE_WIDTH);
		expect(lines.join(" ")).toBe(title);
	});

	test("steps the size down rather than adding lines forever", () => {
		const short = layoutTitle("Short", TITLE_WIDTH);
		const long = layoutTitle(
			"A Reasonably Long Title That Keeps Going And Going For A While Yet",
			TITLE_WIDTH,
		);
		expect(long.size).toBeLessThanOrEqual(short.size);
		expect(long.lines.length).toBeLessThanOrEqual(3);
	});
});

describe("missingGlyphs", () => {
	test("latin and latin-ext are both covered", () => {
		expect(missingGlyphs("Gödel, Łukasiewicz — “quoted” café")).toEqual([]);
	});

	test("reports what the fonts cannot draw", () => {
		expect(missingGlyphs("mark 马克")).toEqual(["马", "克"]);
	});
});

describe("pinArtColors", () => {
	test("throws on an unmapped variable", () => {
		expect(() => pinArtColors('<rect fill="var(--brand-new)"/>')).toThrow(
			/unmapped CSS variable/,
		);
	});

	test("every art family renders without leftover variables", () => {
		for (const family of ["strata", "field", "walk", "depth"] as const) {
			const svg = artSvg({
				seedKey: `og-${family}`,
				family,
				width: 1200,
				height: 630,
			});
			expect(pinArtColors(svg)).not.toContain("var(--");
		}
	});
});

describe("escapeXml", () => {
	test("escapes the five XML entities", () => {
		expect(escapeXml(`<a href="x">A & B's</a>`)).toBe(
			"&lt;a href=&quot;x&quot;&gt;A &amp; B&apos;s&lt;/a&gt;",
		);
	});
});

describe("og fonts", () => {
	const dir = join(
		dirname(fileURLToPath(import.meta.url)),
		"../assets/og-fonts",
	);
	const ttfs = () => readdirSync(dir).filter((f) => f.endsWith(".ttf"));

	test("all four instances exist", () => {
		expect(ttfs().sort()).toEqual([
			"newsreader-og-regular-ext.ttf",
			"newsreader-og-regular.ttf",
			"newsreader-og-semibold-ext.ttf",
			"newsreader-og-semibold.ttf",
		]);
	});

	test("the paths the renderer hands resvg all resolve", () => {
		/* these are cwd-relative because the build bundles this module
		 * elsewhere; a wrong anchor means ENOENT on every card */
		expect(FONT_FILES).toHaveLength(4);
		for (const path of FONT_FILES) {
			expect(existsSync(path)).toBe(true);
		}
	});

	test("name tables carry OG_FAMILY (the SVGs select on it)", () => {
		/* name records are UTF-16BE; if a future instancer change renames
		 * these to "Newsreader 72pt", the cards lose their font silently */
		const nameBytes = Buffer.from(OG_FAMILY, "utf16le").swap16();
		for (const file of ttfs()) {
			expect(readFileSync(join(dir, file)).includes(nameBytes)).toBe(true);
		}
	});
});
