import type { APIRoute } from "astro";

const aiCrawlers = [
	"GPTBot",
	"ChatGPT-User",
	"OAI-SearchBot",
	"ClaudeBot",
	"anthropic-ai",
	"Google-Extended",
	"PerplexityBot",
	"Applebot-Extended",
	"cohere-ai",
	"meta-externalagent",
	"CCBot",
	"Bytespider",
	"FacebookBot",
	"YouBot",
	"Amazonbot",
];

export const GET: APIRoute = ({ site }) => {
	const siteUrl = site?.href ?? "https://johnkferguson.com/";

	const lines = [
		"# Allow all crawlers",
		"User-agent: *",
		"Allow: /",
		"",
		"# Explicitly allow AI crawlers",
		...aiCrawlers.flatMap((crawler) => [
			`User-agent: ${crawler}`,
			"Allow: /",
			"",
		]),
		`Sitemap: ${siteUrl}sitemap-index.xml`,
	];

	return new Response(lines.join("\n"), {
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
		},
	});
};
