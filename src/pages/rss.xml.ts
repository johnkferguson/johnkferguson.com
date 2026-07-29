import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import katex from "katex";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { SITE_DESCRIPTION, SITE_NAME } from "../consts";
import { mdxBodyToMarkdown } from "../lib/mdx-plain";
import { getVisiblePosts } from "../lib/posts";

/* Only the feed renders math. The .md endpoint and llms-full.txt want the
 * LaTeX they were written in — a model reads $M \pm B/2$ perfectly well —
 * so this stays out of mdxBodyToMarkdown and lives with the one consumer
 * that has human eyes and no math renderer downstream. */
const MATHML_TAGS = [
	"math",
	"semantics",
	"mrow",
	"mi",
	"mo",
	"mn",
	"ms",
	"mtext",
	"mspace",
	"msub",
	"msup",
	"msubsup",
	"mfrac",
	"msqrt",
	"mroot",
	"mstyle",
	"mpadded",
	"mphantom",
	"munder",
	"mover",
	"munderover",
	"mtable",
	"mtr",
	"mtd",
	"menclose",
	"mmultiscripts",
];

/**
 * Render the post's math to MathML, which a feed reader can display without
 * a stylesheet. KaTeX's HTML output cannot be used here: it positions every
 * glyph through katex.css, and feed readers strip stylesheets, so it arrives
 * as a column of loose characters.
 *
 * Readers without MathML fall back to the elements' text content, which is
 * right for inline math and for a formula without a fraction. A fraction
 * flattens with its denominator trailing, which is the known cost of not
 * shipping every formula twice.
 */
function mathToMathml(md: string): string {
	const render = (tex: string, displayMode: boolean) =>
		katex.renderToString(tex, {
			output: "mathml",
			displayMode,
			throwOnError: false,
		});
	// display blocks first, so their delimiters are never read as inline pairs
	const withBlocks = md.replace(
		/^\$\$\n([\s\S]*?)\n\$\$$/gm,
		(_m, tex) => `\n\n${render(tex, true)}\n\n`,
	);
	// inline: an unescaped $…$ within one line, which leaves \$5 alone
	return withBlocks.replace(
		/(^|[^\\])\$([^$\n]+?)\$/g,
		(_m, before, tex) => `${before}${render(tex, false)}`,
	);
}

/* html: true so the rendered MathML survives markdown-it; sanitizeHtml
 * below is what keeps that safe. */
const parser = new MarkdownIt({ html: true });

export async function GET(context: APIContext) {
	const posts = await getVisiblePosts();
	const sortedPosts = posts.sort(
		(a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
	);

	return rss({
		title: `${SITE_NAME}'s Blog`,
		description: SITE_DESCRIPTION,
		site: context.site as URL,
		/* match the site's trailingSlash: "never" URLs */
		trailingSlash: false,
		items: sortedPosts.map((post) => ({
			title: post.data.title,
			pubDate: post.data.date,
			link: `/${post.id}`,
			/* sanitize MDX bodies to plain markdown first so imports and
			 * component tags never leak into the feed */
			content: sanitizeHtml(
				parser.render(mathToMathml(mdxBodyToMarkdown(post.body ?? ""))),
				{
					allowedTags: sanitizeHtml.defaults.allowedTags.concat(
						["img"],
						MATHML_TAGS,
					),
					allowedAttributes: {
						...sanitizeHtml.defaults.allowedAttributes,
						math: ["display"],
					},
					/* KaTeX carries the original LaTeX in an annotation for
					 * accessibility tools; kept, it prints after every formula */
					nonTextTags: ["annotation", "annotation-xml"],
				},
			),
		})),
	});
}
