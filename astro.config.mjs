// @ts-check

import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import { remarkLabs } from "./src/lib/remark-labs.mjs";

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
	// Astro 7 defaults: compressHTML switched to "jsx" whitespace rules and the
	// Markdown processor switched to Sätteri. Pin both to the v6 behavior so
	// rendered output (inline-element spacing, rehype plugins) stays identical.
	compressHTML: true,
	build: {
		inlineStylesheets: "auto",
	},
	prefetch: {
		prefetchAll: true,
	},
	markdown: {
		processor: unified(),
		syntaxHighlight: false,
		remarkPlugins: [remarkMath, remarkLabs],
		rehypePlugins: [
			[
				rehypeExternalLinks,
				{ target: "_blank", rel: ["noopener", "noreferrer"] },
			],
			rehypeKatex,
		],
	},
});
