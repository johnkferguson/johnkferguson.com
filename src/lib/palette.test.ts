import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { palette } from "./palette";

/* colors.css is the source of truth; palette.ts is a partial mirror for
 * the JavaScript that cannot read it. These tests are the only thing
 * holding the two together — without them a palette edit lands in the CSS
 * and silently leaves the theme-color meta tag and every OG card behind. */

const CSS = readFileSync(resolve("src/styles/colors.css"), "utf8");

/** custom properties declared in one selector block of colors.css */
function block(selector: string): Map<string, string> {
	/* strip comments first: prose inside them would otherwise be scanned
	 * for declarations */
	const css = CSS.replaceAll(/\/\*[\s\S]*?\*\//g, "");
	const match = css.match(
		new RegExp(`(?:^|\\})\\s*${selector}\\s*\\{([^}]*)\\}`),
	);
	if (!match) throw new Error(`colors.css: no ${selector} block found`);
	const props = new Map<string, string>();
	for (const [, name, value] of match[1].matchAll(
		/(--[a-z0-9-]+)\s*:\s*([^;]+);/g,
	)) {
		props.set(name, value.trim());
	}
	return props;
}

const MODES = [
	{ mode: "light", selector: ":root" },
	{ mode: "dark", selector: "\\.dark" },
] as const;

describe("palette mirrors colors.css", () => {
	for (const { mode, selector } of MODES) {
		const declared = block(selector);
		const mirrored = palette[mode] as Record<string, string>;

		test(`${mode}: colors.css parses`, () => {
			/* a regex that silently matched nothing would make every
			 * comparison below vacuous */
			expect(declared.size).toBeGreaterThan(5);
			expect(declared.get("--bg")).toMatch(/^#[0-9a-f]{6}$/);
		});

		for (const [prop, hex] of Object.entries(mirrored)) {
			test(`${mode} ${prop} matches colors.css`, () => {
				expect(declared.get(prop)).toBe(hex);
			});
		}
	}
});

/**
 * Files allowed to contain a palette hex. This is an exclusion list on
 * purpose: an inclusion list would only ever guard the files that were
 * already dirty when it was written, and the next one to hardcode a hex
 * is exactly the case this test exists to catch. Adding an entry here
 * should be a decision, so each one carries its reason.
 */
const ALLOWED = new Map([
	["src/styles/colors.css", "the source of truth itself"],
	[
		"src/lib/palette.ts",
		"the mirror; palette.test.ts checks it against colors.css",
	],
	[
		"public/assets/favicon.svg",
		"static asset with no CSS context and no theme to follow; generated from the palette, so regenerate it if the palette changes",
	],
	[
		"src/pages/lab/art-tuner.astro",
		"unpublished dark-only debug UI with its own bespoke surface colors, not a copy of the palette",
	],
]);

describe("no file keeps its own copy of the palette", () => {
	const hexes = [
		...Object.values(palette.light),
		...Object.values(palette.dark),
	];

	/* a filesystem walk, not `git ls-files`: an untracked file is exactly
	 * the case this test exists to catch, and listing tracked files only
	 * would let a brand-new one pass locally and fail later in CI */
	const BINARY = /\.(woff2?|ttf|otf|eot|png|jpe?g|webp|avif|ico|gif|pdf)$/i;
	const tracked = ["src", "public"]
		.flatMap((dir) =>
			readdirSync(resolve(dir), { recursive: true, withFileTypes: true })
				.filter((e) => e.isFile())
				.map((e) => relative(resolve("."), resolve(e.parentPath, e.name))),
		)
		.filter((f) => !BINARY.test(f));

	test("the file sweep actually found files", () => {
		/* a walk that silently returned nothing would make this vacuous */
		expect(tracked.length).toBeGreaterThan(20);
		expect(tracked).toContain("src/styles/colors.css");
	});

	test("no unlisted file contains a palette hex", () => {
		const offenders: string[] = [];
		for (const file of tracked) {
			if (ALLOWED.has(file)) continue;
			const source = readFileSync(resolve(file), "utf8").toLowerCase();
			const found = hexes.filter((hex) => source.includes(hex.toLowerCase()));
			if (found.length > 0) offenders.push(`${file}: ${found.join(", ")}`);
		}
		expect(offenders).toEqual([]);
	});

	test("every allowed file still exists and still needs the exemption", () => {
		/* an exemption left behind after its file stopped hardcoding hexes
		 * quietly widens the net for that path */
		for (const [file, reason] of ALLOWED) {
			const source = readFileSync(resolve(file), "utf8").toLowerCase();
			const found = hexes.some((hex) => source.includes(hex.toLowerCase()));
			expect(found, `${file} no longer needs its exemption (${reason})`).toBe(
				true,
			);
		}
	});
});
