/**
 * Sätteri hast plugin: open external links in a new tab.
 *
 * Replaces rehype-external-links, which only ran under the deprecated
 * unified() processor. `filter` is applied in Rust, so only anchors cross
 * into JS.
 *
 * Plain .mjs (not .ts) so astro.config.mjs can import it through Node's
 * own loader: astro tries a plain import() for .mjs configs first and only
 * falls back to spinning up vite when that throws.
 */

import { defineHastPlugin } from "satteri";

/* Matches what rehype-external-links treated as external here. Protocol
 * relative (//host) is deliberately not matched: no content uses it, and
 * treating it as external would be a behavior change, not a port. */
const EXTERNAL = /^https?:\/\//i;

export const externalLinks = defineHastPlugin({
	name: "external-links",
	element: {
		filter: ["a"],
		visit(node, ctx) {
			const href = node.properties?.href;
			if (typeof href !== "string" || !EXTERNAL.test(href)) return;
			ctx.setProperty(node, "target", "_blank");
			/* one space-joined string rather than an array: hast serializes
			 * both identically, and rel is not a class list anyone reads back */
			ctx.setProperty(node, "rel", "noopener noreferrer");
		},
	},
});
