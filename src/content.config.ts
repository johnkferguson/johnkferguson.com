import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const posts = defineCollection({
	loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
	schema: z.object({
		layout: z.string().optional(),
		title: z.string(),
		date: z.coerce.date(),
		tags: z.array(z.string()).optional(),
		description: z.string().optional(),
		/* reading pace for the time estimate; default mixed (220 wpm) */
		pace: z.enum(["technical", "mixed", "non-technical"]).optional(),
		/* banner/thumbnail art: generated from the slug seed by default;
		 * any field here overrides (image path wins over generation) */
		art: z
			.object({
				family: z.enum(["strata", "field", "walk", "depth"]).optional(),
				seed: z.string().optional(),
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

export const collections = { posts, pages };
