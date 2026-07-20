import type { APIRoute } from "astro";
import { SITE_DESCRIPTION, SITE_NAME } from "../consts";
import { mdxBodyToMarkdown } from "../lib/mdx-plain";
import { getVisiblePosts } from "../lib/posts";

export const GET: APIRoute = async () => {
	const posts = await getVisiblePosts();
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	const sections = [
		`# ${SITE_NAME} - Full Content`,
		"",
		`> ${SITE_DESCRIPTION}`,
		"",
		"---",
		"",
	];

	for (const post of sortedPosts) {
		sections.push(
			`# ${post.data.title}`,
			"",
			`**Published:** ${post.data.date.toISOString().split("T")[0]}`,
			"",
			mdxBodyToMarkdown(post.body ?? ""),
			"",
			"---",
			"",
		);
	}

	return new Response(sections.join("\n").trim(), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
