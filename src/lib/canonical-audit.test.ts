import { describe, expect, test } from "bun:test";
import { auditCanonicals, declaredUrls } from "./canonical-audit";

const canonical = (url: string) => `<link rel="canonical" href="${url}">`;
const ogUrl = (url: string) => `<meta property="og:url" content="${url}">`;

describe("declaredUrls", () => {
	test("finds both tag shapes", () => {
		const html = `<head>${canonical("https://x.test/about")}${ogUrl("https://x.test/about")}</head>`;
		expect(declaredUrls(html)).toEqual([
			{ label: "canonical", url: "https://x.test/about" },
			{ label: "og:url", url: "https://x.test/about" },
		]);
	});

	test("does not depend on attribute order", () => {
		const html = `<link href="https://x.test/about" rel="canonical">`;
		expect(declaredUrls(html)).toEqual([
			{ label: "canonical", url: "https://x.test/about" },
		]);
	});

	test("ignores unrelated link and meta tags", () => {
		const html = `<link rel="stylesheet" href="/a.css"><meta name="description" content="x">`;
		expect(declaredUrls(html)).toEqual([]);
	});
});

describe("auditCanonicals", () => {
	test("passes a page naming the served path", () => {
		const html = `${canonical("https://x.test/about")}${ogUrl("https://x.test/about")}`;
		expect(auditCanonicals("about.html", html)).toEqual([]);
	});

	test("passes the homepage at the root", () => {
		expect(auditCanonicals("index.html", canonical("https://x.test/"))).toEqual(
			[],
		);
	});

	test("catches the wiring being dropped from Head.astro", () => {
		const violations = auditCanonicals(
			"about.html",
			canonical("https://x.test/about.html"),
		);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain("build artifact");
	});

	test("catches the homepage regressing to /index.html", () => {
		const violations = auditCanonicals(
			"index.html",
			canonical("https://x.test/index.html"),
		);
		expect(violations).toHaveLength(1);
	});

	test("catches og:url alone, when canonical is still correct", () => {
		/* the two are computed in different components, so one can regress
		 * without the other */
		const html = `${canonical("https://x.test/about")}${ogUrl("https://x.test/about.html")}`;
		const violations = auditCanonicals("about.html", html);
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain("og:url");
	});

	test("fails a page with no canonical at all, rather than reporting it clean", () => {
		const violations = auditCanonicals("about.html", "<head></head>");
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain("no canonical");
	});

	test("fails a relative canonical", () => {
		const violations = auditCanonicals("about.html", canonical("/about"));
		expect(violations).toHaveLength(1);
		expect(violations[0]?.message).toContain("absolute");
	});
});
