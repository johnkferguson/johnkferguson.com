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
		).toBe("See the paper ok");
	});

	test("markdown syntax is stripped", () => {
		expect(createExcerpt("**bold** and `code` > quote")).toBe(
			"bold and code quote",
		);
	});

	test("heading lines are dropped, not merged into the prose", () => {
		/* keeping the heading text produced "Some Section Body text..." */
		expect(createExcerpt("## Some Section\n\nBody text follows here.")).toBe(
			"Body text follows here.",
		);
	});

	test("prose either side of a heading joins cleanly", () => {
		expect(
			createExcerpt("Intro sentence.\n\n## A Section\n\nMore prose."),
		).toBe("Intro sentence. More prose.");
	});

	test("a # without a space is not a heading", () => {
		expect(createExcerpt("#hashtag not a heading")).toBe(
			"hashtag not a heading",
		);
	});

	test("a body of nothing but headings still yields a description", () => {
		/* an empty og:description is worse than a heading in one */
		expect(createExcerpt("# Only A Title")).toBe("Only A Title");
	});

	test("excerpts are a single line, so meta content never holds a newline", () => {
		const out = createExcerpt("First paragraph.\n\nSecond paragraph.");
		expect(out).toBe("First paragraph. Second paragraph.");
		expect(out).not.toMatch(/\s\s|[\n\r\t]/);
	});

	test("collapsing happens before the length budget is measured", () => {
		/* 10 words padded with newlines: the budget must count the words,
		 * not the whitespace that will never appear in the output */
		const padded = `${"word\n\n".repeat(10)}end`;
		expect(createExcerpt(padded, 24)).toBe("word word word word…");
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
