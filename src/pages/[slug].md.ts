import type { CollectionEntry } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";
import { mdxBodyToMarkdown } from "../lib/mdx-plain";
import { getVisiblePosts } from "../lib/posts";

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getVisiblePosts();
	return posts.map((post) => ({
		params: { slug: post.id },
		props: { post },
	}));
};

export const GET: APIRoute = ({ props }) => {
	const { post } = props as { post: CollectionEntry<"posts"> };
	const { title, date } = post.data;

	const header = [
		`# ${title}`,
		"",
		`**Published:** ${date.toISOString().split("T")[0]}`,
		"",
		"---",
		"",
	];

	const markdown = header.join("\n") + mdxBodyToMarkdown(post.body ?? "");

	return new Response(markdown.trim(), {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
		},
	});
};
