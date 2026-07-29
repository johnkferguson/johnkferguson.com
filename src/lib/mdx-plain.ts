/**
 * Reduce a raw MDX post body to plain markdown for the LLM-friendly
 * endpoints (per-post .md and llms-full.txt). Plain .md bodies pass
 * through unchanged; MDX bodies lose their import lines and component
 * tags, with interactive embeds replaced by a bracketed pointer to the
 * web version.
 */
/**
 * Apply `f` to the prose of a body, leaving fenced code blocks alone.
 *
 * Every substitution below rewrites things that are ordinary content inside
 * a fence: an import line, a component tag, a `<Lab>` element. Run over the
 * whole body they edit code samples, and the edit is invisible — the fence
 * survives and the sample inside it is quietly wrong. Splitting on fences
 * once here means a rule added later cannot forget to.
 */
function outsideFences(body: string, f: (prose: string) => string): string {
	// odd indices are the fenced runs, opening delimiter through closing
	const parts = body.split(/(^```[\s\S]*?^```[ \t]*$)/m);
	return parts.map((part, i) => (i % 2 === 1 ? part : f(part))).join("");
}

export function mdxBodyToMarkdown(body: string): string {
	return outsideFences(body, prose)
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

function prose(input: string): string {
	let s = input;
	// top-level import lines (components and CSS)
	s = s.replace(/^import\s.+$\n?/gm, "");
	// interactive lab embeds -> a note naming the lab by its title
	s = s.replace(
		/<Lab\s+title="([^"]*)"[^>]*>\s*<\w+[^>]*\/>\s*<\/Lab>/g,
		"*[Interactive lab in the web version: $1]*",
	);
	// the pipeline flowchart -> a note
	s = s.replace(
		/^<AuctionPipelineChart\s*\/>\s*$/gm,
		"*[Flowchart in the web version: Seal the Auction, then Measure the Book and Match in parallel, then Price the Fills, then Finalize the Window]*",
	);
	// remaining standalone component tags (TableOfContents, BackToTop, ...)
	return s.replace(/^<[A-Z]\w*[^>]*\/>\s*$\n?/gm, "");
}
