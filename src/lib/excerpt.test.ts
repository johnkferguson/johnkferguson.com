import { describe, expect, test } from "bun:test";
import { createExcerpt } from "./excerpt";

describe("createExcerpt", () => {
	test("empty content gives an empty excerpt", () => {
		expect(createExcerpt("")).toBe("");
	});

	test("short content passes through", () => {
		expect(createExcerpt("A short sentence.")).toBe("A short sentence.");
	});

	test("links keep their text, images vanish", () => {
		expect(
			createExcerpt("See [the paper](https://example.com) ![alt](/img.png) ok"),
		).toBe("See the paper  ok");
	});

	test("markdown syntax is stripped", () => {
		expect(createExcerpt("# Title\n**bold** and `code` > quote")).toBe(
			" Title\nbold and code  quote",
		);
	});

	test("escaped literal dollars render plain", () => {
		expect(createExcerpt("It costs \\$5 today.")).toBe("It costs $5 today.");
	});

	test("truncates at a word boundary with an ellipsis", () => {
		const long = `${"word ".repeat(40)}end`;
		const out = createExcerpt(long, 50);
		expect(out.length).toBeLessThanOrEqual(51);
		expect(out.endsWith("…")).toBe(true);
		expect(out).not.toContain("wor…");
	});
});
