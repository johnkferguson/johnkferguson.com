import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { markdownToHtml } from "satteri";
import { containsMath, validateLiteralDollars } from "./literal-dollars";

describe("validateLiteralDollars", () => {
	test("accepts real inline math", () => {
		expect(
			validateLiteralDollars(
				"The Measured Price $M$ moves by $B/2$ when $q_i$ crosses $M \\pm B/2$.",
			),
		).toEqual([]);
	});

	test("accepts math with numbers and operators", () => {
		expect(
			validateLiteralDollars(
				"Averaging gives $0.2 \\times 2000 + 0.8 \\times 8000 = 6800$ here.",
			),
		).toEqual([]);
	});

	test("accepts a bare numeric chip", () => {
		expect(validateLiteralDollars("exactly $10$ units")).toEqual([]);
	});

	test("accepts escaped literal dollars", () => {
		expect(validateLiteralDollars("It costs \\$5 and \\$10 together.")).toEqual(
			[],
		);
	});

	test("flags a lone unescaped dollar amount", () => {
		const v = validateLiteralDollars("It costs $5 total.");
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("odd number");
	});

	test("flags two amounts read as fake math", () => {
		const v = validateLiteralDollars("It costs $5 and $10 together.");
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("prose swallowed");
		expect(v[0].snippet).toBe("$5 and $");
	});

	test("flags a money range", () => {
		const v = validateLiteralDollars("Expect $5-$10 per unit.");
		expect(v).toHaveLength(1);
		expect(v[0].message).toContain("money range");
	});

	test("flags money corrupting real math in the same paragraph", () => {
		const v = validateLiteralDollars(
			"It costs $5 but the Measured Price $M$ moves.",
		);
		expect(v.length).toBeGreaterThan(0);
	});

	test("amounts in different paragraphs still flag individually", () => {
		const v = validateLiteralDollars("Costs $5 here.\n\nCosts $10 there.");
		expect(v).toHaveLength(2);
		expect(v.map((x) => x.line)).toEqual([1, 3]);
	});

	test("ignores code fences and inline code", () => {
		expect(
			validateLiteralDollars(
				"Run `echo $HOME` first.\n\n```sh\necho $5 $10\n```\n\ndone",
			),
		).toEqual([]);
	});

	test("ignores display math blocks", () => {
		expect(
			validateLiteralDollars("Before.\n\n$$\nx = y\n$$\n\nAfter."),
		).toEqual([]);
	});

	test("ignores inline double-dollar math", () => {
		expect(validateLiteralDollars("The value $$x = y$$ here.")).toEqual([]);
	});

	test("ignores frontmatter", () => {
		expect(
			validateLiteralDollars("---\ndescription: costs $5 or $10\n---\n\nBody."),
		).toEqual([]);
	});
});

describe("containsMath", () => {
	test("detects an inline math span", () => {
		expect(containsMath("The Measured Price $M$ moves.")).toBe(true);
	});

	test("detects a display math block", () => {
		expect(containsMath("Before.\n\n$$\nx = y\n$$\n\nAfter.")).toBe(true);
	});

	test("detects inline double-dollar math", () => {
		expect(containsMath("The value $$x = y$$ here.")).toBe(true);
	});

	test("ignores a post with no dollars at all", () => {
		expect(containsMath("Just prose.\n\nMore prose.")).toBe(false);
	});

	test("ignores escaped literal dollars", () => {
		expect(containsMath("It costs \\$5 and \\$10 together.")).toBe(false);
	});

	test("ignores dollars in code fences and inline code", () => {
		expect(
			containsMath(
				"Run `echo $HOME` first.\n\n```sh\necho $5 $10\n```\n\ndone",
			),
		).toBe(false);
	});

	test("ignores dollars in frontmatter", () => {
		expect(
			containsMath("---\ndescription: costs $5 or $10\n---\n\nBody."),
		).toBe(false);
	});
});

/**
 * The rules above encode how the Markdown processor pairs `$`. That processor
 * is now Sätteri rather than remark-math, so pin the assumption to the parser
 * actually in use: if a future Sätteri release stops honoring `\$`, or stops
 * pairing across a paragraph, these fail instead of the site quietly garbling
 * money.
 */
describe("Sätteri math parsing matches the convention", () => {
	const parse = async (md: string) =>
		(await markdownToHtml(md, { features: { math: true } })).html;

	test("an escaped dollar stays literal text", async () => {
		const html = await parse("It costs \\$5 and \\$10 together.");
		expect(html).not.toContain("language-math");
		expect(html).toContain("$5");
	});

	test("a paired span becomes inline math", async () => {
		expect(await parse("The Measured Price $M$ moves.")).toContain(
			'<code class="language-math math-inline">M</code>',
		);
	});

	test("display blocks become display math", async () => {
		expect(await parse("$$\nx = y\n$$")).toContain(
			'<code class="language-math math-display">',
		);
	});

	/* the exact failure validateLiteralDollars exists to prevent: two money
	 * amounts in one paragraph are paired, swallowing the prose between them */
	test("two unescaped dollars pair and swallow the prose between", async () => {
		const html = await parse("It costs $5 and $10 together.");
		expect(html).toContain(
			'<code class="language-math math-inline">5 and </code>',
		);
		expect(
			validateLiteralDollars("It costs $5 and $10 together."),
		).toHaveLength(1);
	});
});

describe("published posts", () => {
	const postsDir = join(import.meta.dir, "../content/posts");
	const posts = readdirSync(postsDir, { recursive: true })
		.map(String)
		.filter((f) => /\.(md|mdx)$/.test(f));

	for (const post of posts) {
		test(`${post} has no unescaped literal dollars`, () => {
			const body = readFileSync(join(postsDir, post), "utf8");
			expect(validateLiteralDollars(body)).toEqual([]);
		});
	}
});
