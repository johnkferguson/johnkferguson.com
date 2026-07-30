// @ts-check

/**
 * Sätteri mdast plugin: build-time discovery of <Lab> embeds in MDX posts.
 *
 * Counts every heading in document order and records each <Lab title="...">
 * with the index of the heading whose territory it sits in. The result rides
 * the standard frontmatter channel, so pages read it from render(post)
 * alongside `headings` and the TOC can merge lab entries into its tree.
 *
 * Plain .mjs (not .ts) so astro.config.mjs can import it through Node's own
 * loader; Lab.astro shares labSlug so the rendered anchor id and the TOC
 * link can never disagree.
 */

import { defineMdastPlugin } from "satteri";

/** @param {string} title */
export function labSlug(title) {
	return title
		.toLowerCase()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

/**
 * A factory, not a shared definition: satteri calls it once per compile, so
 * the heading counter resets per document. A single shared definition would
 * carry both across every post in the build.
 */
export function labs() {
	let heading = -1;

	/**
	 * @param {import("satteri").MdxJsxFlowElement | import("satteri").MdxJsxTextElement} node
	 * @param {import("satteri").MdastVisitorContext} ctx
	 */
	const recordLab = (node, ctx) => {
		if (node.name !== "Lab") return;
		/** @param {string} name */
		const attr = (name) => {
			const a = node.attributes?.find(
				(x) => x.type === "mdxJsxAttribute" && x.name === name,
			);
			return typeof a?.value === "string" ? a.value : undefined;
		};
		const title = attr("title");
		if (!title) return;
		list(ctx).push({
			title,
			id: attr("id") ?? `lab-${labSlug(title)}`,
			afterHeading: heading,
		});
	};

	/**
	 * The labs array, created on first use.
	 *
	 * There is no root or end-of-document hook to initialise it in, so a post
	 * with neither a heading nor a lab exports no `labs` key at all, where the
	 * old remark plugin always exported []. Consumers default it
	 * ([slug].astro), so the difference is invisible.
	 *
	 * `frontmatter` is mutated, never reassigned: @astrojs/mdx validates
	 * `ctx.data.astro.frontmatter` and throws on a null or non-object.
	 *
	 * `data.astro` is optional in satteri's types and seeded by whoever drives
	 * the compile, which both real entry points do (satteri-processor.js:188
	 * and @astrojs/mdx/dist/satteri/index.js). Asserted rather than created
	 * with a defensive `??= {}`: a bag this plugin invented would collect labs
	 * nobody reads, so the TOC would just silently lose its lab entries.
	 *
	 * @param {import("satteri").MdastVisitorContext} ctx
	 */
	const list = (ctx) => {
		const frontmatter = ctx.data.astro?.frontmatter;
		if (!frontmatter) {
			throw new Error(
				"labs plugin: the compile did not seed ctx.data.astro.frontmatter, " +
					"so discovered labs would never reach the page",
			);
		}
		frontmatter.labs ??= [];
		return frontmatter.labs;
	};

	return defineMdastPlugin({
		name: "labs",
		heading(_node, ctx) {
			heading += 1;
			/* every post with a heading exports a list, empty or not, so the
			 * common no-labs case matches the old plugin's output */
			list(ctx);
		},
		/* satteri's walk descends into children on its own, so these visitors
		 * must not recurse: doing so would record every nested lab twice */
		mdxJsxFlowElement: recordLab,
		mdxJsxTextElement: recordLab,
	});
}
