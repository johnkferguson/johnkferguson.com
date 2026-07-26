import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { validatePostDates } from "./post-dates";

const post = (frontmatter: string) => `---\n${frontmatter}\n---\n\nBody.\n`;

describe("validatePostDates", () => {
	test("a post with no updated field passes", () => {
		expect(validatePostDates(post('title: "A"\ndate: 2026-06-26'))).toEqual([]);
	});

	test("updated after date passes", () => {
		expect(
			validatePostDates(
				post('title: "A"\ndate: 2026-06-26\nupdated: 2026-07-01'),
			),
		).toEqual([]);
	});

	test("updated equal to date passes", () => {
		expect(
			validatePostDates(
				post('title: "A"\ndate: 2026-06-26\nupdated: 2026-06-26'),
			),
		).toEqual([]);
	});

	test("updated before date is flagged", () => {
		const v = validatePostDates(
			post('title: "A"\ndate: 2026-06-26\nupdated: 2026-01-01'),
		);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("earlier than date");
	});

	test("timestamps compare, not just calendar days", () => {
		expect(
			validatePostDates(
				post("date: 2026-06-26T12:00:00Z\nupdated: 2026-06-26T09:00:00Z"),
			),
		).toHaveLength(1);
	});

	test("an unreadable updated value is flagged rather than ignored", () => {
		const v = validatePostDates(
			post('date: 2026-06-26\nupdated: "last tuesday"'),
		);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("not a readable date");
	});

	test("updated without a date to compare against is flagged", () => {
		const v = validatePostDates(post("updated: 2026-06-26"));
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("no date");
	});

	test("an indented updated key under art: is not mistaken for the real one", () => {
		/* art has no updated field today; the anchoring is what stops a
		 * future nested key from silently driving this check */
		expect(
			validatePostDates(
				post("date: 2026-06-26\nart:\n  seed: abc\n  updated: 2020-01-01"),
			),
		).toEqual([]);
	});

	test("quoted dates are unwrapped before parsing", () => {
		expect(
			validatePostDates(post('date: "2026-06-26"\nupdated: "2026-01-01"')),
		).toHaveLength(1);
	});

	test("an inline YAML comment is not part of the date", () => {
		expect(
			validatePostDates(
				post("date: 2026-06-26 # published\nupdated: 2026-07-01 # revised"),
			),
		).toEqual([]);
	});

	test("an inline comment still leaves a bad ordering visible", () => {
		const v = validatePostDates(
			post("date: 2026-06-26 # published\nupdated: 2026-01-01 # oops"),
		);
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("earlier than date");
	});

	test("a # inside quotes is data, not a comment", () => {
		const v = validatePostDates(post('date: "2026-06-26 # not a comment"'));
		expect(v).toEqual([]);
	});

	test("content without frontmatter is not this validator's problem", () => {
		expect(validatePostDates("# Just a heading\n")).toEqual([]);
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

	for (const p of posts) {
		test(`${p} has coherent publish and updated dates`, () => {
			const raw = readFileSync(join(postsDir, p), "utf8");
			expect(validatePostDates(raw)).toEqual([]);
		});
	}
});
