/**
 * Reduce a raw MDX post body to plain markdown for the LLM-friendly
 * endpoints (per-post .md and llms-full.txt). Plain .md bodies pass
 * through unchanged; MDX bodies lose their import lines and component
 * tags, with interactive embeds replaced by a bracketed pointer to the
 * web version.
 */
export function mdxBodyToMarkdown(body: string): string {
	let s = body;
	// top-level import lines (components and CSS)
	s = s.replace(/^import\s.+$\n?/gm, "");
	// interactive lab embeds -> a note naming the lab
	s = s.replace(
		/<div class="labwrap">\s*<(\w+)[^>]*\/>\s*<\/div>/g,
		"*[Interactive lab in the web version: $1]*",
	);
	// the pipeline flowchart -> a note
	s = s.replace(
		/^<PipelineChart\s*\/>\s*$/gm,
		"*[Flowchart in the web version: Seal the Auction, then Calculate the Mark and Match in parallel, then Price the Fills, then Finalize the Window]*",
	);
	// remaining standalone component tags (TableOfContents, BackToTop, ...)
	s = s.replace(/^<[A-Z]\w*[^>]*\/>\s*$\n?/gm, "");
	return s.replace(/\n{3,}/g, "\n\n").trim();
}
