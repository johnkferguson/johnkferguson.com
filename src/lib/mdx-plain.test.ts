import { describe, expect, test } from "bun:test";
import { mdxBodyToMarkdown } from "./mdx-plain";

describe("mdxBodyToMarkdown", () => {
	test("plain markdown passes through unchanged", () => {
		const body = "## Heading\n\nSome *prose* with `code` and $M$ math.";
		expect(mdxBodyToMarkdown(body)).toBe(body);
	});

	test("strips top-level import lines", () => {
		const body =
			'import Lab from "../components/Lab.astro";\nimport "katex/dist/katex.min.css";\n\nprose';
		expect(mdxBodyToMarkdown(body)).toBe("prose");
	});

	test("Lab embeds become a pointer naming the lab by its title", () => {
		const body =
			'<Lab title="Setting the Base Fee">\n  <BaseFeeLab client:visible />\n</Lab>';
		expect(mdxBodyToMarkdown(body)).toBe(
			"*[Interactive lab in the web version: Setting the Base Fee]*",
		);
	});

	test("AuctionPipelineChart becomes the flowchart description", () => {
		const out = mdxBodyToMarkdown(
			"before\n\n<AuctionPipelineChart />\n\nafter",
		);
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
	test("leaves fenced code blocks alone", () => {
		// every rule below rewrites things that are ordinary content inside a
		// fence; run over the whole body they edit the sample and leave the
		// fence standing, so the sample is wrong and nothing looks wrong
		const body = [
			'import Lab from "../../components/Lab.astro";',
			"",
			"Prose.",
			"",
			"```ts",
			'import { computeMeasure } from "./engine";',
			"const m = computeMeasure(books, params, 100);",
			"```",
			"",
			"```mdx",
			"<TableOfContents />",
			'<Lab title="Setting the Base Fee">',
			"  <BaseFeeLab client:visible />",
			"</Lab>",
			"```",
		].join("\n");
		const out = mdxBodyToMarkdown(body);
		// the real import went, the fenced one stayed
		expect(out).not.toContain("components/Lab.astro");
		expect(out).toContain('import { computeMeasure } from "./engine";');
		// the fenced component tags survived verbatim
		expect(out).toContain("<TableOfContents />");
		expect(out).toContain('<Lab title="Setting the Base Fee">');
		expect(out).toContain("<BaseFeeLab client:visible />");
		expect(out).not.toContain("Interactive lab in the web version");
	});
});
