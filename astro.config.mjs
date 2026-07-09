// @ts-check

import { unified } from "@astrojs/markdown-remark";
import mdx from "@astrojs/mdx";
import preact from "@astrojs/preact";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import rehypeExternalLinks from "rehype-external-links";

export default defineConfig({
	site: "https://johnkferguson.com",
	output: "static",
	integrations: [
		sitemap({
			// /lab/ pages are unpublished playgrounds for in-progress interactive posts
			filter: (page) => !page.includes("/lab/"),
		}),
		mdx(),
		preact({ compat: true }),
	],
	vite: {
		plugins: [tailwindcss()],
	},
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
		rehypePlugins: [
			[
				rehypeExternalLinks,
				{ target: "_blank", rel: ["noopener", "noreferrer"] },
			],
		],
	},
});
