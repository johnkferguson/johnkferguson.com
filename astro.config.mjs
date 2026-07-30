// @ts-check

import { satteri } from "@astrojs/markdown-satteri";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { externalLinks } from "./src/markdown/external-links.mjs";
import { katexMath } from "./src/markdown/katex.mjs";
import { labs } from "./src/markdown/labs.mjs";

export default defineConfig({
	site: "https://johnkferguson.com",
	output: "static",
	// Builds get their own cache: dev and build share the content-layer
	// store by default, and a production build (which glob-excludes
	// drafts) would clobber the running dev server's store, 500ing
	// draft pages until a dev restart.
	cacheDir: process.env.ASTRO_BUILD ? "node_modules/.astro-build" : undefined,
	integrations: [
		sitemap({
			// /lab/ pages are unpublished playgrounds for in-progress interactive posts
			filter: (page) => !page.includes("/lab/"),
		}),
		mdx(),
		preact({ compat: true }),
	],
	trailingSlash: "never",
	// Astro 7 switched compressHTML to "jsx" whitespace rules, which strips
	// whitespace between elements. Pinned to the v6 behavior so inline-element
	// spacing stays identical; taking the new default is its own change.
	compressHTML: true,
	build: {
		inlineStylesheets: "auto",
	},
	prefetch: {
		prefetchAll: true,
	},
	markdown: {
		// Sätteri's plugin channels, NOT remarkPlugins/rehypePlugins: those
		// still typecheck under this processor but are silently ignored, so a
		// plugin moved back into them stops running with no error.
		processor: satteri({
			// math is a parser feature only ($x$ -> code.language-math);
			// src/markdown/katex.mjs renders it. gfm and smartPunctuation are
			// derived from astro's own defaults, so they need no entry here.
			features: { math: true },
			mdastPlugins: [labs],
			hastPlugins: [externalLinks, katexMath],
		}),
		syntaxHighlight: false,
	},
});
