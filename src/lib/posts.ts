import { type CollectionEntry, getCollection } from "astro:content";

/** Dev-mode switch for dev-only affordances (draft posts, future
 * dev banners/tooling). True under `astro dev`, false in builds. */
export const IS_DEV = import.meta.env.DEV;

/**
 * Posts visible in the current mode: drafts (frontmatter `draft: true`)
 * appear in dev so they can be worked on, and are excluded from
 * production builds entirely (no page, no feed/list/sitemap entries).
 */
export async function getVisiblePosts(): Promise<CollectionEntry<"posts">[]> {
	const posts = await getCollection("posts");
	return posts.filter((post) => IS_DEV || !post.data.draft);
}
