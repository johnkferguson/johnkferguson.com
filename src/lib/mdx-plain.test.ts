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

	test("Lab embeds become a pointer naming the lab by its title", () => {
		const body =
			'<Lab title="Setting the Base Fee">\n  <BaseFeeLab client:visible />\n</Lab>';
		expect(mdxBodyToMarkdown(body)).toBe(
			"*[Interactive lab in the web version: Setting the Base Fee]*",
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
	 * instead of silently leaking JSX into the .md endpoints: the Lab
	 * regex only handles a single self-closing island inside the frame. */
	test("Lab with other children is NOT handled (documented limitation)", () => {
		const body = '<Lab title="X">\nsome prose\n</Lab>';
		expect(mdxBodyToMarkdown(body)).toBe(body);
	});
});
