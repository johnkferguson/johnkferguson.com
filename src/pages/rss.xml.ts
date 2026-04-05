import { getCollection } from "astro:content";
import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

const parser = new MarkdownIt();

export async function GET(context: APIContext) {
	const posts = await getCollection("posts");
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	return rss({
		title: "John Ferguson's Blog",
		description: "Thoughts on web development, technology, and life.",
		site: context.site as URL,
		items: sortedPosts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.date,
			link: `/${post.id}`,
			content: sanitizeHtml(parser.render(post.body ?? ""), {
				allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img"]),
			}),
		})),
	});
}
