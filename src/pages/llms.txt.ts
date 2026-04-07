import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { SITE_DESCRIPTION, SITE_NAME } from "../consts";

export const GET: APIRoute = async ({ site }) => {
	const siteUrl = site?.href ?? "https://johnkferguson.com";
	const base = siteUrl.replace(/\/$/, "");

	const posts = await getCollection("posts");
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	const lines = [
		`# ${SITE_NAME}`,
		"",
		`> ${SITE_DESCRIPTION}`,
		"",
		"## Posts",
		"",
		...sortedPosts.map(
			(p) =>
				`- [${p.data.title}](${base}/${p.id}.md): ${p.data.title} (${p.data.date.toISOString().split("T")[0]})`,
		),
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
