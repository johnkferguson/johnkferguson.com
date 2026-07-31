/* Canonical pathnames.
 *
 * build.format is "file", so a page is emitted as dist/slug.html and
 * Astro.url.pathname carries that extension during the build. Feeding it
 * straight to a canonical or og:url tag advertises /slug.html, and the
 * homepage becomes /index.html.
 *
 * With pretty_urls = false, Netlify serves /slug, /slug/ and /slug.html
 * all at 200 and redirects none of them (measured on a deploy preview;
 * astro preview differs, it 404s /slug/). Nothing downstream picks a
 * winner, so these tags and the sitemap are the only thing telling a
 * crawler which spelling to keep. */
export function canonicalPath(pathname: string): string {
	/* both formats: dist/index.html and dist/slug/index.html */
	const withoutIndex = pathname.replace(/(^|\/)index\.html$/, "$1");
	const withoutExtension = withoutIndex.replace(/\.html$/, "");

	/* the root collapses to "" above; every other path keeps its leading
	 * slash and loses any trailing one, matching trailingSlash: "never" */
	if (withoutExtension === "" || withoutExtension === "/") return "/";
	return withoutExtension.replace(/\/$/, "");
}
