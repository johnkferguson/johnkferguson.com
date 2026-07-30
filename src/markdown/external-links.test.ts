import { describe, expect, test } from "bun:test";
import { markdownToHtml } from "satteri";
import { externalLinks } from "./external-links.mjs";

/** the anchor attributes for a single markdown link, or null if left alone */
async function link(href: string) {
	const { html } = await markdownToHtml(`[text](${href})`, {
		hastPlugins: [externalLinks],
	});
	const match = html.match(/<a ([^>]*)>/);
	if (!match) throw new Error(`no anchor rendered for ${href}`);
	return {
		external: match[1].includes('target="_blank"'),
		attrs: match[1],
	};
}

describe("externalLinks", () => {
	test("externalizes http and https", async () => {
		for (const href of ["https://example.com/a", "http://example.com/a"]) {
			expect((await link(href)).external).toBe(true);
		}
	});

	test("emits target then rel, matching the previous output", async () => {
		expect((await link("https://example.com/a")).attrs).toBe(
			'href="https://example.com/a" target="_blank" rel="noopener noreferrer"',
		);
	});

	test("leaves relative and root-relative links alone", async () => {
		for (const href of ["/about", "./sibling", "#anchor"]) {
			expect((await link(href)).external).toBe(false);
		}
	});

	/* rehype-external-links defaulted protocols to ['http', 'https'], so these
	 * were never externalized and must stay that way */
	test("leaves other absolute schemes alone", async () => {
		for (const href of ["mailto:a@b.com", "tel:+15551234"]) {
			expect((await link(href)).external).toBe(false);
		}
	});

	/* the two forms a naive /^https?:\/\// test would silently stop matching:
	 * is-absolute-url keyed on the scheme alone, with no "//" requirement */
	test("externalizes protocol-relative and schemeless-authority forms", async () => {
		expect((await link("//example.com/a")).external).toBe(true);
		expect((await link("https:example.com")).external).toBe(true);
	});
});
