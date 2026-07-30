// @ts-check

/**
 * Sätteri hast plugin: open external links in a new tab.
 *
 * Replaces rehype-external-links, which only ran under the deprecated
 * unified() processor. `filter` is applied in Rust, so only anchors cross
 * into JS.
 *
 * Note this sees only anchors the Markdown pipeline produced. A hand-written
 * <a> in an MDX post is an mdxJsxTextElement, which the `element` filter does
 * not match; rehype-external-links did not reach those either, so the
 * behavior is unchanged, but it is worth knowing before hand-rolling one.
 *
 * Plain .mjs (not .ts) so astro.config.mjs can import it through Node's
 * own loader: astro tries a plain import() for .mjs configs first and only
 * falls back to spinning up vite when that throws.
 */

import { defineHastPlugin } from "satteri";

/* rehype-external-links' own test, ported rather than approximated
 * (lib/index.js:102,122-126). An absolute URL is external when its scheme is
 * http or https; anything else absolute (mailto:, tel:) is left alone, and a
 * protocol-relative //host counts as external.
 *
 * A plain /^https?:\/\// would look equivalent and is not: is-absolute-url
 * matches on the scheme alone, with no "//" requirement, so it would silently
 * stop externalizing both `//host/x` and `https:x`. */
const ABSOLUTE = /^[a-zA-Z][a-zA-Z\d+\-.]*?:/;
const WINDOWS_PATH = /^[a-zA-Z]:\\/;
const PROTOCOLS = ["http", "https"];

/** @param {string} url */
function isExternal(url) {
	if (!WINDOWS_PATH.test(url) && ABSOLUTE.test(url)) {
		return PROTOCOLS.includes(url.slice(0, url.indexOf(":")));
	}
	return url.startsWith("//");
}

export const externalLinks = defineHastPlugin({
	name: "external-links",
	element: {
		filter: ["a"],
		visit(node, ctx) {
			const href = node.properties?.href;
			if (typeof href !== "string" || !isExternal(href)) return;
			ctx.setProperty(node, "target", "_blank");
			/* one space-joined string rather than an array: hast serializes
			 * both identically, and rel is not a class list anyone reads back */
			ctx.setProperty(node, "rel", "noopener noreferrer");
		},
	},
});
