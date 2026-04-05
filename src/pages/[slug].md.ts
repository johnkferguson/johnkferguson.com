import { type CollectionEntry, getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";

export const getStaticPaths: GetStaticPaths = async () => {
	const posts = await getCollection("posts");
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

	const markdown = header.join("\n") + (post.body ?? "");

	return new Response(markdown.trim(), {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
		},
	});
};
