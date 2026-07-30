import { describe, expect, test } from "bun:test";
import { mdxToJs } from "satteri";
import { labSlug, labs } from "./labs.mjs";

/**
 * Compile MDX through satteri with the real plugin attached, rather than
 * hand-building an mdast: the plugin's contract is the visitor dispatch order
 * and the per-compile closure reset, neither of which a fixture tree exercises.
 */
async function run(mdx: string) {
	const astro = {
		frontmatter: {} as Record<string, unknown>,
		headings: [],
		localImagePaths: new Set<string>(),
		remoteImagePaths: new Set<string>(),
	};
	await mdxToJs(mdx, { mdastPlugins: [labs], data: { astro } });
	return astro.frontmatter.labs;
}

describe("labSlug", () => {
	test("lowercases and hyphenates", () => {
		expect(labSlug("Base Fee: The Price of Placement")).toBe(
			"base-fee-the-price-of-placement",
		);
	});
	test("trims edge punctuation", () => {
		expect(labSlug("  (Demand!)  ")).toBe("demand");
	});
	test("drops apostrophes instead of hyphenating them", () => {
		expect(labSlug("Running One Maker's Book")).toBe("running-one-makers-book");
	});
});

describe("labs", () => {
	test("records labs with the index of the preceding heading", async () => {
		expect(
			await run(`## One

<Lab title="Base Fee" />

## Two

### Three

<Lab title="Demand" id="lab-demand" />
`),
		).toEqual([
			{ title: "Base Fee", id: "lab-base-fee", afterHeading: 0 },
			{ title: "Demand", id: "lab-demand", afterHeading: 2 },
		]);
	});

	test("a lab before any heading reports afterHeading -1", async () => {
		expect(await run(`<Lab title="Early" />\n`)).toEqual([
			{ title: "Early", id: "lab-early", afterHeading: -1 },
		]);
	});

	test("labs without a title are skipped", async () => {
		expect(await run(`## One\n\n<Lab />\n`)).toEqual([]);
	});

	test("posts with headings but no labs export an empty list", async () => {
		expect(await run(`## One\n`)).toEqual([]);
	});

	/* the shape every post actually uses: a Lab wrapping one island. satteri's
	 * walk descends on its own, so a visitor that also recursed would record
	 * the outer Lab twice. */
	test("a lab wrapping a child island is recorded once", async () => {
		expect(
			await run(`## One

<Lab title="Base Fee">
  <BaseFeeLab client:visible />
</Lab>
`),
		).toEqual([{ title: "Base Fee", id: "lab-base-fee", afterHeading: 0 }]);
	});

	test("nested labs are each recorded once", async () => {
		expect(
			await run(`## One

<Lab title="Outer">
  <Lab title="Inner" />
</Lab>
`),
		).toEqual([
			{ title: "Outer", id: "lab-outer", afterHeading: 0 },
			{ title: "Inner", id: "lab-inner", afterHeading: 0 },
		]);
	});

	/* the plugin is a factory so satteri resets its heading counter per
	 * document; a shared definition would carry both counter and list across
	 * every post in a build */
	test("state does not leak between compiles", async () => {
		await run(`## One\n\n## Two\n\n<Lab title="First" />\n`);
		expect(await run(`## One\n\n<Lab title="Second" />\n`)).toEqual([
			{ title: "Second", id: "lab-second", afterHeading: 0 },
		]);
	});
});
