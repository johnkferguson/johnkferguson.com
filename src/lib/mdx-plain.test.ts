import { describe, expect, test } from "bun:test";
import { mdxBodyToMarkdown } from "./mdx-plain";

describe("mdxBodyToMarkdown", () => {
	test("plain markdown passes through unchanged", () => {
		const body = "## Heading\n\nSome *prose* with `code` and $M$ math.";
		expect(mdxBodyToMarkdown(body)).toBe(body);
	});

	test("strips top-level import lines", () => {
		const body =
			'import Lab from "../components/labs/Lab";\nimport "katex/dist/katex.min.css";\n\nprose';
		expect(mdxBodyToMarkdown(body)).toBe("prose");
	});

	test("labwrap embeds become a pointer naming the lab", () => {
		const body = '<div class="labwrap">\n<BaseFeeLab client:load />\n</div>';
		expect(mdxBodyToMarkdown(body)).toBe(
			"*[Interactive lab in the web version: BaseFeeLab]*",
		);
	});

	test("PipelineChart becomes the flowchart description", () => {
		const out = mdxBodyToMarkdown("before\n\n<PipelineChart />\n\nafter");
		expect(out).toContain("*[Flowchart in the web version:");
		expect(out).toContain("Seal the Auction");
	});

	test("remaining standalone component tags vanish", () => {
		expect(mdxBodyToMarkdown("<TableOfContents />\n\nprose")).toBe("prose");
	});

	test("collapses the blank lines stripping leaves behind", () => {
		const out = mdxBodyToMarkdown(
			'import A from "./A";\n\n\n<A />\n\n\n\ntext',
		);
		expect(out).toBe("text");
	});

	/* Known limitation, pinned so a markup change fails loudly here
	 * instead of silently leaking JSX into the .md endpoints: the labwrap
	 * regex only handles a single self-closing component. */
	test("labwrap with children is NOT handled (documented limitation)", () => {
		const body = '<div class="labwrap">\n<Lab>content</Lab>\n</div>';
		expect(mdxBodyToMarkdown(body)).toBe(body);
	});
});
