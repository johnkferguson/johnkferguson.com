/** Plain-text excerpt from a markdown body, for list descriptions and
 * meta fallbacks when frontmatter has no description. */
export function createExcerpt(content: string, maxLength = 160): string {
	if (!content) return "";
	const plain = content
		/* links keep their text, never their URLs */
		.replace(/!\[[^\]]*\]\([^)]*\)/g, "")
		.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
		.replace(/(\*\*|\*|_|`|>|#|\[|\]|\(|\))/g, "")
		/* literal dollars are escaped \$ in post prose; excerpts show them plain */
		.replace(/\\\$/g, "$");
	if (plain.length <= maxLength) return plain;
	let truncated = plain.substring(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > 0) truncated = truncated.substring(0, lastSpace);
	return `${truncated}…`;
}
