import { describe, expect, test } from "bun:test";
import { canonicalPath } from "./canonical";

describe("canonicalPath", () => {
	test("strips the .html that build.format 'file' puts on every page", () => {
		expect(canonicalPath("/snapshot-fees.html")).toBe("/snapshot-fees");
		expect(canonicalPath("/about.html")).toBe("/about");
		expect(canonicalPath("/404.html")).toBe("/404");
	});

	test("collapses the homepage to the root", () => {
		expect(canonicalPath("/index.html")).toBe("/");
		expect(canonicalPath("/")).toBe("/");
	});

	test("handles nested pages", () => {
		expect(canonicalPath("/lab/toc-test.html")).toBe("/lab/toc-test");
	});

	test("leaves an already-clean path alone", () => {
		expect(canonicalPath("/snapshot-fees")).toBe("/snapshot-fees");
	});

	test("drops a trailing slash, matching trailingSlash: never", () => {
		expect(canonicalPath("/snapshot-fees/")).toBe("/snapshot-fees");
	});

	test("survives directory-format paths, so a format flip cannot resurrect /index.html", () => {
		expect(canonicalPath("/snapshot-fees/index.html")).toBe("/snapshot-fees");
	});

	test("does not eat .html inside a longer segment", () => {
		expect(canonicalPath("/about.html.backup")).toBe("/about.html.backup");
	});
});
