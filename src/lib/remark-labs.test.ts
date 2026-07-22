import { describe, expect, test } from "bun:test";
import { labSlug, remarkLabs } from "./remark-labs.mjs";

const lab = (title?: string, id?: string) => ({
	type: "mdxJsxFlowElement",
	name: "Lab",
	attributes: [
		...(title
			? [{ type: "mdxJsxAttribute", name: "title", value: title }]
			: []),
		...(id ? [{ type: "mdxJsxAttribute", name: "id", value: id }] : []),
	],
	children: [],
});
const heading = (depth: number) => ({ type: "heading", depth, children: [] });

const run = (children: unknown[]) => {
	const file = { data: {} as { astro?: { frontmatter?: { labs?: unknown } } } };
	remarkLabs()({ children }, file);
	return file.data.astro?.frontmatter?.labs;
};

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

describe("remarkLabs", () => {
	test("records labs with the index of the preceding heading", () => {
		expect(
			run([
				heading(2),
				lab("Base Fee"),
				heading(2),
				heading(3),
				lab("Demand", "lab-demand"),
			]),
		).toEqual([
			{ title: "Base Fee", id: "lab-base-fee", afterHeading: 0 },
			{ title: "Demand", id: "lab-demand", afterHeading: 2 },
		]);
	});

	test("a lab before any heading reports afterHeading -1", () => {
		expect(run([lab("Early")])).toEqual([
			{ title: "Early", id: "lab-early", afterHeading: -1 },
		]);
	});

	test("labs without a title are skipped", () => {
		expect(run([heading(2), lab()])).toEqual([]);
	});

	test("posts without labs still export an empty list", () => {
		expect(run([heading(2)])).toEqual([]);
	});
});
