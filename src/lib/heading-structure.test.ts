import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validateHeadingStructure } from "./heading-structure";

describe("validateHeadingStructure", () => {
	test("accepts stepwise nesting", () => {
		expect(
			validateHeadingStructure("## A\n### B\n#### C\n### D\n## E"),
		).toEqual([]);
	});

	test("flags an h4 directly under an h2", () => {
		const v = validateHeadingStructure("## A\n#### C");
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("skips a level");
	});

	test("flags an h5 directly under an h3", () => {
		expect(validateHeadingStructure("## A\n### B\n##### E")).toHaveLength(1);
	});

	test("ignores headings inside code fences", () => {
		expect(
			validateHeadingStructure("## A\n```\n#### not a heading\n```\n### B"),
		).toEqual([]);
	});

	test("resets legally after returning to a shallower level", () => {
		expect(
			validateHeadingStructure("## A\n### B\n#### C\n## D\n### E"),
		).toEqual([]);
	});
});

describe("published posts", () => {
	const postsDir = join(import.meta.dir, "../content/posts");
	const posts = readdirSync(postsDir, { recursive: true })
		.map(String)
		.filter((f) => /\.(md|mdx)$/.test(f));

	test("posts exist", () => {
		expect(posts.length).toBeGreaterThan(0);
	});

	for (const post of posts) {
		test(`${post} has no heading level skips`, () => {
			const body = readFileSync(join(postsDir, post), "utf8");
			expect(validateHeadingStructure(body)).toEqual([]);
		});
	}
});
