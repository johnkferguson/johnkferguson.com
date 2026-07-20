import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

describe("no consumer keeps its own copy", () => {
	/* the drift this module exists to prevent: these four files each used
	 * to hardcode palette hexes, and nothing failed when the CSS moved */
	const CONSUMERS = [
		"src/consts.ts",
		"src/lib/og.ts",
		"src/layouts/BaseLayout.astro",
		"src/components/ThemeToggle.astro",
	];

	const hexes = [
		...Object.values(palette.light),
		...Object.values(palette.dark),
	];

	for (const file of CONSUMERS) {
		test(`${file} references no palette hex directly`, () => {
			const source = readFileSync(resolve(file), "utf8");
			const found = hexes.filter((hex) =>
				source.toLowerCase().includes(hex.toLowerCase()),
			);
			expect(found).toEqual([]);
		});
	}
});
