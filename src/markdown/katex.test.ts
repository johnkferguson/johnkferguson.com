import { describe, expect, test } from "bun:test";
import { markdownToHtml, mdxToJs } from "satteri";
import { katexMath } from "./katex.mjs";

const md = (source: string) =>
	markdownToHtml(source, {
		features: { math: true },
		hastPlugins: [katexMath],
	});

const mdx = (source: string) =>
	mdxToJs(source, { features: { math: true }, hastPlugins: [katexMath] });

describe("katexMath", () => {
	test("renders inline math", async () => {
		const { html } = await md("The Measured Price $M$ moves.");
		expect(html).toContain('<span class="katex">');
		expect(html).not.toContain("language-math");
	});

	test("renders a display block, replacing the pre", async () => {
		const { html } = await md("$$\nx = y\n$$");
		expect(html).toContain('class="katex-display"');
		expect(html).not.toContain("<pre>");
	});

	/**
	 * The bug this port actually shipped once: replacing math with a
	 * `{ type: "raw" }` node. markdownToHtml serializes raw as HTML, so the
	 * .md path looked fine, but MDX compiles a raw node to a plain STRING
	 * child in the JSX tree, and JSX escapes string children when it renders.
	 * Every formula in the .mdx post came out as visible
	 * `&lt;span class=&quot;katex&quot;&gt;` markup while the build reported
	 * success.
	 *
	 * Asserting on the escaped text cannot catch it, because the escaping
	 * happens at render time, not compile time. The compile-time signature is
	 * what to assert: a hast element becomes `className: "katex"` JSX props,
	 * whereas raw HTML shows up as a `"<span class=..."` string literal.
	 */
	test("MDX compiles math to JSX elements, not a raw HTML string", async () => {
		const { code } = await mdx("Inline $M$ and a block:\n\n$$\nx = y\n$$\n");
		expect(code).toContain('className: "katex"');
		expect(code).toContain("katex-display");
		expect(code).not.toContain("<span class=");
	});

	/**
	 * A ```math fence arrives as pre > code.language-math with no math-display
	 * class, so display mode has to come from the pre. Keying on the class
	 * alone rendered it inline and left the pre wrapped around the formula.
	 */
	test("a math fence is display mode and loses its pre", async () => {
		const { html } = await md("```math\nx = y\n```");
		expect(html).toContain('class="katex-display"');
		expect(html).toContain('display="block"');
		expect(html).not.toContain("<pre>");
	});

	test("a math fence does not trail a newline into the copyable LaTeX", async () => {
		const { html } = await md("```math\nx = y\n```");
		expect(html).toContain(
			'<annotation encoding="application/x-tex">x = y</annotation>',
		);
	});

	/* the copy button and rss.xml.ts both read the MathML annotation */
	test("keeps the MathML annotation carrying the TeX source", async () => {
		const { html } = await md("$M \\pm B/2$");
		expect(html).toContain('<span class="katex-mathml">');
		expect(html).toContain(
			'<annotation encoding="application/x-tex">M \\pm B/2</annotation>',
		);
	});

	test("leaves non-math code blocks alone", async () => {
		const { html } = await md("```ts\nconst x = 1;\n```");
		expect(html).toContain('<pre><code class="language-ts">');
		expect(html).not.toContain("katex");
	});

	test("leaves inline code alone", async () => {
		const { html } = await md("Run `echo $HOME` first.");
		expect(html).toContain("<code>echo $HOME</code>");
		expect(html).not.toContain("katex");
	});

	/**
	 * A malformed formula still renders (as red katex-error text) so the page
	 * does not lose content, but it must not do so silently. ASTRO_BUILD is
	 * unset under `bun test`, so this exercises the warn path; a production
	 * build throws instead.
	 */
	test("warns about a malformed formula and still renders it", async () => {
		const warnings: string[] = [];
		const original = console.warn;
		console.warn = (...args: unknown[]) => warnings.push(String(args[0]));
		try {
			const { html } = await md("$\\frac{1}$");
			expect(html).toContain("katex-error");
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain("Could not render math with KaTeX");
			expect(warnings[0]).toContain("\\frac{1}");
		} finally {
			console.warn = original;
		}
	});
});
