import { getCollection } from "astro:content";
import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
	const posts = await getCollection("posts");
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	const sections = [
		"# John K. Ferguson - Full Content",
		"",
		"> Personal website and blog of John K. Ferguson, exploring software development, technology, and more.",
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
			post.body ?? "",
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
