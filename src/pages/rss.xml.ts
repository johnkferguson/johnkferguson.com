import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { SITE_DESCRIPTION, SITE_NAME } from "../consts";
import { getVisiblePosts } from "../lib/posts";

const parser = new MarkdownIt();

export async function GET(context: APIContext) {
	const posts = await getVisiblePosts();
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	return rss({
		title: `${SITE_NAME}'s Blog`,
		description: SITE_DESCRIPTION,
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
