/** Plain-text excerpt from a markdown body, for list descriptions and
 * meta fallbacks when frontmatter has no description. */

/** ATX heading lines, dropped whole rather than stripped of their #.
 *
 * Blocks are joined with a single space, which reads correctly only when
 * the preceding block ends in sentence-ending punctuation. Prose
 * paragraphs do; headings do not, so keeping their text produced
 * run-ons ("Some Section Body text follows here"). Punctuating around
 * it does not work either: inserting ". " at every break doubles the
 * period after the majority of paragraphs, which already end in one.
 *
 * Dropping them is the better answer anyway. A section heading is
 * navigation, and navigation has no business in a prose summary. */
const HEADING_LINE = /^[ \t]{0,3}#{1,6}[ \t].*$/gm;

function toPlainText(content: string): string {
	return (
		content
			/* links keep their text, never their URLs */
			.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
			.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
			.replace(/(\*\*|\*|_|`|>|#|\[|\]|\(|\))/g, "")
			/* literal dollars are escaped \$ in post prose; excerpts show them plain */
			.replace(/\\\$/g, "$")
			/* one line, always: an excerpt crossing a paragraph break puts a raw
			 * newline inside meta content="…", which scrapers render literally.
			 * Collapse before measuring so the length budget counts real text. */
			.replace(/\s+/g, " ")
			.trim()
	);
}

export function createExcerpt(content: string, maxLength = 160): string {
	if (!content) return "";
	/* a body that is nothing but headings would otherwise excerpt to the
	 * empty string, and an empty description is worse than a heading */
	const plain =
		toPlainText(content.replace(HEADING_LINE, "")) || toPlainText(content);
	if (plain.length <= maxLength) return plain;
	let truncated = plain.substring(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > 0) truncated = truncated.substring(0, lastSpace);
	return `${truncated}…`;
}
