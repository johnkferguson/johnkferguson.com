/**
 * Sätteri hast plugin: render math with KaTeX at build time.
 *
 * Replaces remark-math + rehype-katex, which only ran under the deprecated
 * unified() processor. Sätteri's `math` feature (enabled in
 * astro.config.mjs) is a parser only: it emits the same hast remark-math
 * did, `code.language-math.math-inline` for `$x$` and
 * `pre > code.language-math.math-display` for `$$ ... $$`. This plugin
 * supplies the rendering half, from the same katex package rehype-katex
 * used, so the emitted markup is unchanged.
 *
 * Math fences are never syntax highlighted ahead of this plugin: astro's
 * defaultExcludeLanguages is ["math"], and syntaxHighlight is false here
 * anyway.
 */

import { fromHtml } from "hast-util-from-html";
import katex from "katex";
import { defineHastPlugin } from "satteri";

/**
 * Parse KaTeX's HTML string into real hast, the way rehype-katex did.
 *
 * A `{ type: "raw" }` node is NOT an option: satteri groups raw with its
 * text-like node types, so plain Markdown serializes it as HTML but the
 * MDX/JSX pipeline escapes it, and every formula in an .mdx post renders as
 * visible `&lt;span class=&quot;katex&quot;&gt;` markup.
 *
 * @param {string} html
 */
function parse(html) {
	const root = fromHtml(html, { fragment: true });
	/* katex.renderToString always returns exactly one wrapper span */
	return root.children[0];
}

export const katexMath = defineHastPlugin({
	name: "katex",
	element: {
		filter: ["code"],
		visit(node, ctx) {
			const classes = node.properties?.className;
			if (!Array.isArray(classes) || !classes.includes("language-math")) {
				return;
			}
			const displayMode = classes.includes("math-display");
			const html = katex.renderToString(ctx.textContent(node), {
				displayMode,
				throwOnError: false,
				/* htmlAndMathml, not html: the MathML branch carries the
				 * original LaTeX in an annotation, which PostLayout's copy
				 * button reads (selecting rendered KaTeX by hand yields
				 * garbled text) and which rss.xml.ts renders on its own */
				output: "htmlAndMathml",
			});
			/* display math replaces the wrapping <pre>, matching how
			 * rehype-katex scoped it; leaving the <pre> would keep a code
			 * block's styling wrapped around a rendered formula */
			ctx.replaceNode(displayMode ? ctx.parent(node) : node, parse(html));
		},
	},
});
