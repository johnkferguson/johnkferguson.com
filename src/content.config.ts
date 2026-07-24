import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/* Drafts live in posts/drafts/ and are excluded from PRODUCTION builds
 * at the loader level so none of their modules (labs, engine, KaTeX
 * fonts) can reach the bundle. generateId strips the drafts/ prefix so
 * a post keeps the same slug in dev and after publishing (publish =
 * move the file up one level and drop draft: true). */
const posts = defineCollection({
	loader: glob({
		pattern: [
			"**/*.{md,mdx}",
			/* keyed on the build script's env (not PROD) so `astro sync`
			 * keeps dev manifests draft-inclusive */
			...(process.env.ASTRO_BUILD ? ["!drafts/**"] : []),
		],
		base: "./src/content/posts",
		generateId: ({ entry }) =>
			entry.replace(/^drafts\//, "").replace(/\.(md|mdx)$/, ""),
	}),
	schema: z.object({
		layout: z.string().optional(),
		title: z.string(),
		date: z.coerce.date(),
		tags: z.array(z.string()).optional(),
		description: z.string().optional(),
		/* drafts render in dev, excluded from production builds */
		draft: z.boolean().optional(),
		/* reading pace for the time estimate; default mixed (220 wpm) */
		pace: z.enum(["technical", "mixed", "non-technical"]).optional(),
		/* banner/thumbnail art: generated from the slug seed by default;
		 * any field here overrides (image path wins over generation) */
		art: z
			.object({
				family: z.enum(["strata", "field", "walk", "depth"]).optional(),
				/** bespoke generator from src/lib/art/pieces; wins over family */
				piece: z.string().optional(),
				seed: z.string().optional(),
				/** dial overrides for the piece, keyed by its param spec */
				params: z.record(z.string(), z.number()).optional(),
				/** homepage-thumbnail crop of the backdrop artwork,
				 * fractions of the composition (picked in the dev picker) */
				thumb: z
					.object({
						x: z.number(),
						y: z.number(),
						w: z.number(),
						h: z.number(),
					})
					.optional(),
				/** animate the homepage thumbnail (seeded SMIL drift) */
				motion: z.boolean().optional(),
				image: z.string().optional(),
			})
			.optional(),
	}),
});

const pages = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/pages" }),
	schema: z.object({
		title: z.string(),
		description: z.string().optional(),
	}),
});

/* small editable fragments rendered inside layouts (homepage blurb);
 * body-only markdown, no frontmatter required */
const snippets = defineCollection({
	loader: glob({ pattern: "**/*.md", base: "./src/content/snippets" }),
	schema: z.object({}),
});

export const collections = { posts, pages, snippets };
