/* Canonical pathnames.
 *
 * build.format is "file", so a page is emitted as dist/slug.html and
 * Astro.url.pathname carries that extension during the build. Feeding it
 * straight to a canonical or og:url tag advertises /slug.html, and the
 * homepage becomes /index.html, neither of which is the URL Netlify
 * serves. Strip the build artifact back to the served path.
 *
 * Netlify serves slug.html at /slug and 301s /slug.html to it, so the
 * bare path is the one canonical should name. */
export function canonicalPath(pathname: string): string {
	/* both formats: dist/index.html and dist/slug/index.html */
	const withoutIndex = pathname.replace(/(^|\/)index\.html$/, "$1");
	const withoutExtension = withoutIndex.replace(/\.html$/, "");

	/* the root collapses to "" above; every other path keeps its leading
	 * slash and loses any trailing one, matching trailingSlash: "never" */
	if (withoutExtension === "" || withoutExtension === "/") return "/";
	return withoutExtension.replace(/\/$/, "");
}
