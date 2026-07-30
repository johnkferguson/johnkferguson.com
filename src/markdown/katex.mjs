// @ts-check

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
 * @returns {import("hast").ElementContent | undefined}
 */
function parse(html) {
	const root = fromHtml(html, { fragment: true });
	/* katex.renderToString returns exactly one wrapper span. Guarded rather
	 * than asserted: replaceNode(node, undefined) would drop the formula and
	 * leave nothing to trace it back to. */
	if (root.children.length !== 1) return undefined;
	const only = root.children[0];
	return only.type === "element" ? only : undefined;
}

/**
 * Warn about a formula that did not render.
 *
 * `ctx.report()` is not usable for this: satteri collects hast diagnostics on
 * the visitor context, but nothing reads them back. `compile.js` calls
 * `visitHastHandle` for its dropped-patch count only, and neither
 * `@astrojs/markdown-satteri` nor `@astrojs/mdx` touches `getDiagnostics()`.
 * A report would be silently discarded, which is the failure this guards.
 *
 * So: console for the dev server, and a hard failure for a production build,
 * where shipping red `katex-error` text to readers with no signal is worse
 * than a failed deploy. ASTRO_BUILD is set by the build script.
 *
 * @param {string} tex
 * @param {unknown} cause
 */
function mathFailed(tex, cause) {
	const detail = cause instanceof Error ? cause.message : String(cause);
	const message = `Could not render math with KaTeX: ${detail}\n  source: ${tex}`;
	if (process.env.ASTRO_BUILD) throw new Error(message);
	console.warn(`[katex] ${message}`);
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
			/* A ``` ```math ``` fence arrives as pre > code.language-math with NO
			 * math-display class, so display mode has to come from the wrapping
			 * pre as well, exactly as rehype-katex derived it (lib/index.js:64-75).
			 * Keying on the class alone renders a fence inline and leaves the pre
			 * in place, wrapping code-block styling around a rendered formula. */
			const parent = ctx.parent(node);
			const inPre = parent?.type === "element" && parent.tagName === "pre";
			const displayMode = classes.includes("math-display") || inPre;
			/* a fence's text carries the trailing newline mdast gives code nodes.
			 * rehype-katex passed that through to katex, but the annotation is what
			 * PostLayout's copy button hands the reader, so trim it here. */
			const tex = ctx.textContent(node).replace(/\n+$/, "");

			/** @type {string} */
			let html;
			try {
				/* throwOnError first purely for the diagnostic, as rehype-katex did:
				 * it is the only way to learn the formula is malformed, since the
				 * lenient render succeeds and returns red error markup instead. */
				html = katex.renderToString(tex, {
					displayMode,
					throwOnError: true,
					/* htmlAndMathml, not html: the MathML branch carries the
					 * original LaTeX in an annotation, which PostLayout's copy
					 * button reads (selecting rendered KaTeX by hand yields
					 * garbled text) and which rss.xml.ts renders on its own */
					output: "htmlAndMathml",
				});
			} catch (error) {
				mathFailed(tex, error);
				html = katex.renderToString(tex, {
					displayMode,
					throwOnError: false,
					strict: "ignore",
					output: "htmlAndMathml",
				});
			}

			const rendered = parse(html);
			if (!rendered) {
				mathFailed(tex, "KaTeX output was not a single element");
				return;
			}
			/* display math replaces the wrapping <pre>, matching how
			 * rehype-katex scoped it */
			ctx.replaceNode(inPre ? parent : node, rendered);
		},
	},
});
