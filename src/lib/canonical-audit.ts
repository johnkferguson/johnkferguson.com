/* Assert the built pages actually name bare canonical paths.
 *
 * canonicalPath() is unit-tested, but nothing catches its call being
 * dropped from Head.astro or JsonLd.astro: all the unit tests still pass
 * and /about.html canonicals ship. lychee cannot see it either, because
 * fallback_extensions makes /about.html resolve to a real file, and
 * Lighthouse's own `canonical` audit only flags relative URLs, conflicting
 * tags and cross-domain targets, never a same-domain URL that is simply
 * not the one meant.
 *
 * So this checks the artifact, the way katex-assets.test.ts byte-compares
 * the committed KaTeX copy rather than trusting the plugin's own tests.
 * It reads dist/, so it runs as a check.yml step after the build; a
 * bun:test that skipped when dist/ was absent would assert nothing for
 * most of its life. */

export interface CanonicalViolation {
	file: string;
	message: string;
}

/** Every <link> and <meta> tag, whatever order their attributes are in. */
const TAG = /<(?:link|meta)\b[^>]*>/gi;

function attr(tag: string, name: string): string | null {
	const m = tag.match(new RegExp(`\\b${name}="([^"]*)"`, "i"));
	return m ? m[1] : null;
}

/** The canonical and og:url values a page declares, in document order. */
export function declaredUrls(html: string): { label: string; url: string }[] {
	const found: { label: string; url: string }[] = [];
	for (const tag of html.match(TAG) ?? []) {
		if (/\brel="canonical"/i.test(tag)) {
			const url = attr(tag, "href");
			if (url !== null) found.push({ label: "canonical", url });
		}
		if (/\bproperty="og:url"/i.test(tag)) {
			const url = attr(tag, "content");
			if (url !== null) found.push({ label: "og:url", url });
		}
	}
	return found;
}

/**
 * Two assertions, because one of them alone fails open.
 *
 * A page whose canonical ends in `.html` is the wiring having been
 * dropped. A page with no canonical at all is the tag having been removed
 * from the layout, which a check that only inspected the tags it found
 * would report as clean.
 */
export function auditCanonicals(
	file: string,
	html: string,
): CanonicalViolation[] {
	const declared = declaredUrls(html);

	if (declared.length === 0) {
		return [
			{
				file,
				message:
					"no canonical or og:url tag - the layout stopped emitting one, so nothing names this page's preferred URL",
			},
		];
	}

	const violations: CanonicalViolation[] = [];
	for (const { label, url } of declared) {
		let pathname: string;
		try {
			pathname = new URL(url).pathname;
		} catch {
			violations.push({
				file,
				message: `${label} is not an absolute URL: ${url}`,
			});
			continue;
		}
		if (pathname.endsWith(".html")) {
			violations.push({
				file,
				message: `${label} names a build artifact, not the served URL: ${url} (canonicalPath() unwired in Head.astro or JsonLd.astro?)`,
			});
		}
	}
	return violations;
}
